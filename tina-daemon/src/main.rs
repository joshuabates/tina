use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use clap::Parser;
use futures::StreamExt;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use tina_daemon::actions;
use tina_daemon::config::DaemonConfig;
use tina_daemon::heartbeat;
use tina_daemon::http;
use tina_daemon::reconcile;
use tina_daemon::sync::{self, SyncCache};
use tina_daemon::telemetry::DaemonTelemetry;
use tina_daemon::watcher::{DaemonWatcher, WatchEvent};

use convex::{FunctionResult, Value};
use tina_data::{InboundAction, TinaConvexClient};

#[derive(Parser)]
#[command(
    name = "tina-daemon",
    about = "Syncs local orchestration state to Convex"
)]
struct Cli {
    /// Path to config file (default: ~/.config/tina/config.toml)
    #[arg(long)]
    config: Option<PathBuf>,

    /// Tina environment profile to use (`prod` or `dev`)
    #[arg(long)]
    env: Option<String>,
}

/// Refresh active worktree discovery, attach watchers, and backfill commit/plan
/// projection for newly discovered orchestrations.
async fn refresh_worktrees(
    client: &Arc<Mutex<TinaConvexClient>>,
    cache: &mut SyncCache,
    watcher: &mut DaemonWatcher,
    telemetry: &DaemonTelemetry,
) -> Result<()> {
    let previous_ids: HashSet<String> = cache
        .worktrees
        .iter()
        .map(|w| w.orchestration_id.clone())
        .collect();

    let worktrees = sync::discover_worktrees(client).await?;

    for worktree in &worktrees {
        let ref_path = worktree
            .worktree_path
            .join(".git")
            .join("refs")
            .join("heads")
            .join(&worktree.branch);

        if ref_path.exists() {
            if let Err(e) = watcher.watch_git_ref(&ref_path) {
                warn!(
                    feature = %worktree.feature,
                    path = %ref_path.display(),
                    error = %e,
                    "failed to watch git ref"
                );
            }
        }

        let mut plan_dirs = vec![worktree.worktree_path.join("docs").join("plans")];
        if let Some(repo_root) = worktree.worktree_path.parent().and_then(|p| p.parent()) {
            let repo_plans = repo_root.join("docs").join("plans");
            if repo_plans != plan_dirs[0] {
                plan_dirs.push(repo_plans);
            }
        }

        for plans_dir in &plan_dirs {
            if plans_dir.exists() {
                if let Err(e) = watcher.watch_plan_dir(plans_dir) {
                    warn!(
                        feature = %worktree.feature,
                        path = %plans_dir.display(),
                        error = %e,
                        "failed to watch plans directory"
                    );
                }
            }
        }

        // Backfill once for orchestration worktrees discovered after daemon startup.
        if !previous_ids.contains(&worktree.orchestration_id) {
            if let Err(e) = sync::sync_commits(
                client,
                cache,
                &worktree.orchestration_id,
                &worktree.current_phase,
                &worktree.worktree_path,
                &worktree.branch,
                Some(telemetry),
            )
            .await
            {
                warn!(
                    feature = %worktree.feature,
                    error = %e,
                    "failed to backfill commits for new worktree"
                );
            }

            for plans_dir in &plan_dirs {
                if !plans_dir.exists() {
                    continue;
                }
                match std::fs::read_dir(plans_dir) {
                    Ok(entries) => {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                                continue;
                            }
                            if let Err(e) = sync::sync_plan(
                                client,
                                &worktree.orchestration_id,
                                &path,
                                Some(telemetry),
                            )
                            .await
                            {
                                warn!(
                                    feature = %worktree.feature,
                                    path = %path.display(),
                                    error = %e,
                                    "failed to backfill plan for new worktree"
                                );
                            }
                        }
                    }
                    Err(e) => {
                        warn!(
                            feature = %worktree.feature,
                            path = %plans_dir.display(),
                            error = %e,
                            "failed to read plans directory for backfill"
                        );
                    }
                }
            }
        }
    }

    cache.set_worktrees(worktrees);
    Ok(())
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
    let config = DaemonConfig::load(cli.config.as_ref(), cli.env.as_deref())?;
    info!(
        node = %config.node_name,
        env = %config.env,
        url = %config.convex_url,
        "loaded config"
    );

    // Connect to Convex
    let mut client = TinaConvexClient::new(&config.convex_url).await?;
    info!("connected to Convex");

    // Register node
    let auth_token_hash = heartbeat::hash_auth_token(&config.auth_token);
    let node_id =
        heartbeat::register_node(&mut client, &config.node_name, &auth_token_hash).await?;

    let client = Arc::new(Mutex::new(client));
    let cancel = CancellationToken::new();

    // Initialize telemetry (best-effort, no orchestration context at daemon level)
    let telemetry = DaemonTelemetry::new(Arc::clone(&client));

    // Start heartbeat
    let heartbeat_handle =
        heartbeat::spawn_heartbeat(Arc::clone(&client), node_id.clone(), cancel.clone());

    // Start HTTP server (with Convex client for session persistence)
    let http_cancel = cancel.clone();
    let http_handle = http::spawn_http_server_with_client(
        config.http_port,
        http_cancel,
        Some(Arc::clone(&client)),
    )
    .await?;

    // Set up file watchers
    let home = dirs::home_dir().expect("could not determine home directory");
    let teams_dir = home.join(".claude").join("teams");
    let tasks_dir = home.join(".claude").join("tasks");

    let mut watcher = DaemonWatcher::new(&teams_dir, &tasks_dir)?;

    // Initialize sync cache before startup sync/watcher operations.
    let mut cache = SyncCache::new();

    // Discover active worktrees first so commit/plan backfill and watchers
    // are active before potentially expensive team/task projection work.
    info!("discovering active worktrees");
    if let Err(e) = refresh_worktrees(&client, &mut cache, &mut watcher, &telemetry).await {
        error!(error = %e, "worktree discovery failed, git and plan watching may be incomplete");
    }

    // Initial full sync
    if let Err(e) = sync::sync_all(
        &client,
        &mut cache,
        &teams_dir,
        &tasks_dir,
        Some(&telemetry),
    )
    .await
    {
        error!(error = %e, "initial sync failed");
    }

    // Run crash-recovery reconciliation: mark terminal sessions whose tmux
    // panes no longer exist as ended, and log team members with dead panes.
    info!("running startup reconciliation");
    match reconcile::reconcile(&client).await {
        Ok(result) => {
            info!(
                sessions_ended = result.sessions_ended,
                members_with_dead_panes = result.members_with_dead_panes,
                "startup reconciliation complete"
            );
        }
        Err(e) => {
            error!(error = %e, "startup reconciliation failed");
        }
    }

    info!("daemon initialization complete");

    // Subscribe to pending actions
    let mut action_sub = {
        let mut client_guard = client.lock().await;
        client_guard.subscribe_pending_actions(&node_id).await?
    };

    info!("daemon started, entering main loop");

    // Periodic reconciliation timer (every 60 seconds)
    let mut reconcile_interval = tokio::time::interval(std::time::Duration::from_secs(60));
    reconcile_interval.tick().await; // consume the immediate first tick

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

            // Periodic reconciliation
            _ = reconcile_interval.tick() => {
                match reconcile::reconcile(&client).await {
                    Ok(result) => {
                        if result.sessions_ended > 0 || result.members_with_dead_panes > 0 {
                            info!(
                                sessions_ended = result.sessions_ended,
                                members_with_dead_panes = result.members_with_dead_panes,
                                "periodic reconciliation complete"
                            );
                        }
                    }
                    Err(e) => {
                        warn!(error = %e, "periodic reconciliation failed");
                    }
                }
            }

            // File change events
            event = watcher.rx.recv() => {
                match event {
                    Some(WatchEvent::Teams) | Some(WatchEvent::Tasks) => {
                        if let Err(e) =
                            refresh_worktrees(&client, &mut cache, &mut watcher, &telemetry).await
                        {
                            error!(error = %e, "worktree refresh failed");
                        }
                        if let Err(e) = sync::sync_all(
                            &client, &mut cache, &teams_dir, &tasks_dir, Some(&telemetry),
                        ).await {
                            error!(error = %e, "sync failed");
                        }
                    }
                    Some(WatchEvent::GitRef(ref_path)) => {
                        // Git ref changed - sync commits for this worktree
                        if let Some(worktree) = cache.find_worktree_by_ref_path(&ref_path).cloned() {
                            info!(
                                feature = %worktree.feature,
                                branch = %worktree.branch,
                                "git ref changed, syncing commits"
                            );
                            if let Err(e) = sync::sync_commits(
                                &client,
                                &mut cache,
                                &worktree.orchestration_id,
                                &worktree.current_phase,
                                &worktree.worktree_path,
                                &worktree.branch,
                                Some(&telemetry),
                            ).await {
                                error!(
                                    feature = %worktree.feature,
                                    error = %e,
                                    "failed to sync commits"
                                );
                            }
                        } else {
                            warn!(
                                path = %ref_path.display(),
                                "git ref changed but no worktree found in cache"
                            );
                        }
                    }
                    Some(WatchEvent::Plan(plan_path)) => {
                        // Plan file changed - sync to Convex
                        if let Some(worktree) = cache.find_worktree_by_plan_path(&plan_path).cloned() {
                            info!(
                                feature = %worktree.feature,
                                path = %plan_path.display(),
                                "plan file changed, syncing to Convex"
                            );
                            if let Err(e) = sync::sync_plan(
                                &client,
                                &worktree.orchestration_id,
                                &plan_path,
                                Some(&telemetry),
                            ).await {
                                error!(
                                    feature = %worktree.feature,
                                    error = %e,
                                    "failed to sync plan"
                                );
                            }
                        } else {
                            warn!(
                                path = %plan_path.display(),
                                "plan file changed but no worktree found in cache"
                            );
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
        }
    }

    // Clean shutdown
    heartbeat_handle.abort();
    http_handle.abort();
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
