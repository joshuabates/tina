use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use clap::Parser;
use futures::StreamExt;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use tina_daemon::actions;
use tina_daemon::config::DaemonConfig;
use tina_daemon::heartbeat;
use tina_daemon::sync::{self, SyncCache};
use tina_daemon::watcher::{DaemonWatcher, WatchEvent};

use convex::{FunctionResult, Value};
use tina_data::{InboundAction, TinaConvexClient};

#[derive(Parser)]
#[command(name = "tina-daemon", about = "Syncs local orchestration state to Convex")]
struct Cli {
    /// Path to config file (default: ~/.config/tina/config.toml)
    #[arg(long)]
    config: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    // Load config
    let config = DaemonConfig::load(cli.config.as_ref())?;
    info!(node = %config.node_name, url = %config.convex_url, "loaded config");

    // Connect to Convex
    let mut client = TinaConvexClient::new(&config.convex_url).await?;
    info!("connected to Convex");

    // Register node
    let auth_token_hash = heartbeat::hash_auth_token(&config.auth_token);
    let node_id =
        heartbeat::register_node(&mut client, &config.node_name, &auth_token_hash).await?;

    let client = Arc::new(Mutex::new(client));
    let cancel = CancellationToken::new();

    // Start heartbeat
    let heartbeat_handle = heartbeat::spawn_heartbeat(
        Arc::clone(&client),
        node_id.clone(),
        cancel.clone(),
    );

    // Set up file watchers
    let home = dirs::home_dir().expect("could not determine home directory");
    let teams_dir = home.join(".claude").join("teams");
    let tasks_dir = home.join(".claude").join("tasks");

    let mut watcher = DaemonWatcher::new(&teams_dir, &tasks_dir)?;

    // Initial full sync
    let mut cache = SyncCache::new();
    if let Err(e) = sync::sync_all(&client, &mut cache, &teams_dir, &tasks_dir, &node_id).await {
        error!(error = %e, "initial sync failed");
    }

    // Subscribe to pending actions
    let mut action_sub = {
        let mut client_guard = client.lock().await;
        client_guard.subscribe_pending_actions(&node_id).await?
    };

    info!("daemon started, entering main loop");

    // Periodic refresh interval for session lookups
    let mut refresh_interval = tokio::time::interval(Duration::from_secs(60));
    refresh_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    // Main event loop
    loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                info!("shutdown signal received");
                break;
            }

            _ = tokio::signal::ctrl_c() => {
                info!("received ctrl-c, shutting down");
                cancel.cancel();
                break;
            }

            // File change events
            event = watcher.rx.recv() => {
                match event {
                    Some(WatchEvent::Teams) => {
                        let team_names = sync::list_team_names(&teams_dir).unwrap_or_default();
                        for name in &team_names {
                            if let Err(e) = sync::sync_team_members(
                                &client, &mut cache, &teams_dir, name,
                            ).await {
                                error!(team = %name, error = %e, "team sync failed");
                            }
                        }
                    }
                    Some(WatchEvent::Tasks) => {
                        if let Err(e) = sync::sync_tasks(
                            &client, &mut cache, &teams_dir, &tasks_dir,
                        ).await {
                            error!(error = %e, "task sync failed");
                        }
                    }
                    Some(WatchEvent::SupervisorState { feature }) => {
                        if let Err(e) = sync::sync_supervisor_state(
                            &client, &mut cache, &feature, &node_id,
                        ).await {
                            error!(feature = %feature, error = %e, "supervisor state sync failed");
                        }
                    }
                    None => {
                        info!("watcher channel closed, shutting down");
                        cancel.cancel();
                        break;
                    }
                }
            }

            // Inbound actions from Convex subscription
            result = action_sub.next() => {
                match result {
                    Some(FunctionResult::Value(value)) => {
                        if let Err(e) = handle_pending_actions(&client, &value).await {
                            error!(error = %e, "failed to handle pending actions");
                        }
                    }
                    Some(FunctionResult::ErrorMessage(msg)) => {
                        error!(error = %msg, "pending actions query error");
                    }
                    Some(FunctionResult::ConvexError(err)) => {
                        error!(error = ?err, "pending actions convex error");
                    }
                    None => {
                        warn!("action subscription ended, will not receive new actions");
                    }
                }
            }

            // Periodic refresh of session lookups
            _ = refresh_interval.tick() => {
                if let Err(e) = watcher.refresh_state_watches() {
                    error!(error = %e, "failed to refresh state watches");
                }
            }
        }
    }

    // Clean shutdown
    heartbeat_handle.abort();
    info!("daemon stopped");
    Ok(())
}

/// Parse pending actions from a Convex subscription result and dispatch each one.
async fn handle_pending_actions(
    client: &Arc<Mutex<TinaConvexClient>>,
    value: &Value,
) -> Result<()> {
    let actions = parse_inbound_actions(value)?;
    for action in &actions {
        if let Err(e) = actions::dispatch_action(client, action).await {
            error!(action_id = %action.id, error = %e, "failed to dispatch action");
        }
    }
    Ok(())
}

/// Parse a Convex Value (expected array of objects) into InboundAction structs.
fn parse_inbound_actions(value: &Value) -> Result<Vec<InboundAction>> {
    let Value::Array(items) = value else {
        return Ok(vec![]);
    };

    let mut actions = Vec::new();
    for item in items {
        let Value::Object(map) = item else { continue };

        let id = match map.get("_id") {
            Some(Value::String(s)) => s.clone(),
            _ => continue,
        };
        let node_id = match map.get("nodeId") {
            Some(Value::String(s)) => s.clone(),
            _ => continue,
        };
        let orchestration_id = match map.get("orchestrationId") {
            Some(Value::String(s)) => s.clone(),
            _ => continue,
        };
        let action_type = match map.get("type") {
            Some(Value::String(s)) => s.clone(),
            _ => continue,
        };
        let payload = match map.get("payload") {
            Some(Value::String(s)) => s.clone(),
            _ => continue,
        };
        let status = match map.get("status") {
            Some(Value::String(s)) => s.clone(),
            _ => "pending".to_string(),
        };
        let created_at = match map.get("createdAt") {
            Some(Value::Float64(f)) => *f,
            Some(Value::Int64(i)) => *i as f64,
            _ => 0.0,
        };

        actions.push(InboundAction {
            id,
            node_id,
            orchestration_id,
            action_type,
            payload,
            status,
            created_at,
        });
    }
    Ok(actions)
}
