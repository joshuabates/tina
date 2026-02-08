use std::collections::BTreeMap;

use convex::{ConvexClient, FunctionResult, Value};
use sha2::{Digest, Sha256};

use super::config;

/// A short-lived Convex connection for CLI commands.
///
/// Registers a node (or reuses cached), then provides typed write methods.
pub struct ConvexWriter {
    client: ConvexClient,
    node_id: String,
}

impl ConvexWriter {
    /// Connect to Convex and register a node.
    ///
    /// Returns Err if config is missing or connection fails.
    pub async fn connect() -> anyhow::Result<Self> {
        let cfg = config::load_config()?;
        let url = cfg
            .convex_url
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow::anyhow!("convex_url not set in config"))?;
        let token = cfg
            .auth_token
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow::anyhow!("auth_token not set in config"))?;
        let node_name = cfg
            .node_name
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| {
                hostname::get()
                    .ok()
                    .and_then(|h| h.into_string().ok())
                    .unwrap_or_else(|| "unknown".to_string())
            });

        let mut client = ConvexClient::new(&url).await?;

        // Register node to get a valid node ID
        let token_hash = hash_token(&token);
        let mut args = BTreeMap::new();
        args.insert("name".into(), Value::from(node_name.as_str()));
        args.insert("os".into(), Value::from("darwin"));
        args.insert("authTokenHash".into(), Value::from(token_hash.as_str()));
        let result = client.mutation("nodes:registerNode", args).await?;
        let node_id = extract_string(result)?;

        Ok(Self { client, node_id })
    }

    /// Upsert an orchestration record. Returns the orchestration doc ID.
    pub async fn upsert_orchestration(
        &mut self,
        feature_name: &str,
        design_doc_path: &str,
        branch: &str,
        worktree_path: Option<&str>,
        total_phases: i64,
        current_phase: i64,
        status: &str,
        started_at: &str,
        completed_at: Option<&str>,
        total_elapsed_mins: Option<f64>,
    ) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(self.node_id.as_str()));
        args.insert("featureName".into(), Value::from(feature_name));
        args.insert("designDocPath".into(), Value::from(design_doc_path));
        args.insert("branch".into(), Value::from(branch));
        if let Some(wp) = worktree_path {
            args.insert("worktreePath".into(), Value::from(wp));
        }
        args.insert("totalPhases".into(), Value::from(total_phases));
        args.insert("currentPhase".into(), Value::from(current_phase));
        args.insert("status".into(), Value::from(status));
        args.insert("startedAt".into(), Value::from(started_at));
        if let Some(ca) = completed_at {
            args.insert("completedAt".into(), Value::from(ca));
        }
        if let Some(mins) = total_elapsed_mins {
            args.insert("totalElapsedMins".into(), Value::from(mins));
        }

        let result = self
            .client
            .mutation("orchestrations:upsertOrchestration", args)
            .await?;
        extract_string(result)
    }

    /// Upsert a phase record.
    pub async fn upsert_phase(
        &mut self,
        orchestration_id: &str,
        phase_number: &str,
        status: &str,
        plan_path: Option<&str>,
        git_range: Option<&str>,
        planning_mins: Option<i64>,
        execution_mins: Option<i64>,
        review_mins: Option<i64>,
        started_at: Option<&str>,
        completed_at: Option<&str>,
    ) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        args.insert("phaseNumber".into(), Value::from(phase_number));
        args.insert("status".into(), Value::from(status));
        if let Some(pp) = plan_path {
            args.insert("planPath".into(), Value::from(pp));
        }
        if let Some(gr) = git_range {
            args.insert("gitRange".into(), Value::from(gr));
        }
        if let Some(m) = planning_mins {
            args.insert("planningMins".into(), Value::from(m));
        }
        if let Some(m) = execution_mins {
            args.insert("executionMins".into(), Value::from(m));
        }
        if let Some(m) = review_mins {
            args.insert("reviewMins".into(), Value::from(m));
        }
        if let Some(sa) = started_at {
            args.insert("startedAt".into(), Value::from(sa));
        }
        if let Some(ca) = completed_at {
            args.insert("completedAt".into(), Value::from(ca));
        }

        let result = self.client.mutation("phases:upsertPhase", args).await?;
        extract_string(result)
    }

    /// Record an orchestration event.
    pub async fn record_event(
        &mut self,
        orchestration_id: &str,
        phase_number: Option<&str>,
        event_type: &str,
        source: &str,
        summary: &str,
        detail: Option<&str>,
    ) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(orchestration_id));
        if let Some(pn) = phase_number {
            args.insert("phaseNumber".into(), Value::from(pn));
        }
        args.insert("eventType".into(), Value::from(event_type));
        args.insert("source".into(), Value::from(source));
        args.insert("summary".into(), Value::from(summary));
        if let Some(d) = detail {
            args.insert("detail".into(), Value::from(d));
        }
        args.insert(
            "recordedAt".into(),
            Value::from(chrono::Utc::now().to_rfc3339().as_str()),
        );

        let result = self.client.mutation("events:recordEvent", args).await?;
        extract_string(result)
    }
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn extract_string(result: FunctionResult) -> anyhow::Result<String> {
    match result {
        FunctionResult::Value(Value::String(s)) => Ok(s),
        FunctionResult::Value(other) => {
            anyhow::bail!("expected string from Convex, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => anyhow::bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => anyhow::bail!("Convex error: {:?}", err),
    }
}

/// Run an async Convex write operation using a one-shot tokio runtime.
///
/// All Convex writes in tina-session use this pattern since the CLI is synchronous.
/// The closure receives a connected ConvexWriter. If connection fails, the error
/// is returned (caller wraps in non-fatal warning).
pub fn run_convex_write<F, Fut>(f: F) -> anyhow::Result<()>
where
    F: FnOnce(ConvexWriter) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<()>>,
{
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let writer = ConvexWriter::connect().await?;
        f(writer).await
    })
}
