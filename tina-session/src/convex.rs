use std::collections::BTreeMap;

use convex::{ConvexClient, FunctionResult, Value};
use sha2::{Digest, Sha256};

use crate::config;

/// Orchestration data for Convex upsert.
pub struct OrchestrationArgs {
    pub node_id: String,
    pub project_id: Option<String>,
    pub feature_name: String,
    pub design_doc_path: String,
    pub branch: String,
    pub worktree_path: Option<String>,
    pub total_phases: f64,
    pub current_phase: f64,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub total_elapsed_mins: Option<f64>,
}

/// Phase data for Convex upsert.
pub struct PhaseArgs {
    pub orchestration_id: String,
    pub phase_number: String,
    pub status: String,
    pub plan_path: Option<String>,
    pub git_range: Option<String>,
    pub planning_mins: Option<f64>,
    pub execution_mins: Option<f64>,
    pub review_mins: Option<f64>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

/// Event data for Convex recording.
pub struct EventArgs {
    pub orchestration_id: String,
    pub phase_number: Option<String>,
    pub event_type: String,
    pub source: String,
    pub summary: String,
    pub detail: Option<String>,
    pub recorded_at: String,
}

/// A short-lived Convex connection for CLI commands.
///
/// Registers a node (or reuses cached), then provides typed write methods.
pub struct ConvexWriter {
    client: ConvexClient,
    node_id: String,
}

impl ConvexWriter {
    /// Connect to Convex and register a node.
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

        let token_hash = hash_token(&token);
        let mut args = BTreeMap::new();
        args.insert("name".into(), Value::from(node_name.as_str()));
        args.insert("os".into(), Value::from("darwin"));
        args.insert("authTokenHash".into(), Value::from(token_hash.as_str()));
        let result = client.mutation("nodes:registerNode", args).await?;
        let node_id = extract_string(result)?;

        Ok(Self { client, node_id })
    }

    /// Returns this writer's registered node ID.
    pub fn node_id(&self) -> &str {
        &self.node_id
    }

    /// Find or create a project by repo path. Returns the project doc ID.
    pub async fn find_or_create_project(
        &mut self,
        name: &str,
        repo_path: &str,
    ) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("name".into(), Value::from(name));
        args.insert("repoPath".into(), Value::from(repo_path));
        let result = self
            .client
            .mutation("projects:findOrCreateByRepoPath", args)
            .await?;
        extract_string(result)
    }

    /// Upsert an orchestration record. Returns the orchestration doc ID.
    pub async fn upsert_orchestration(
        &mut self,
        orch: &OrchestrationArgs,
    ) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(orch.node_id.as_str()));
        if let Some(ref pid) = orch.project_id {
            args.insert("projectId".into(), Value::from(pid.as_str()));
        }
        args.insert("featureName".into(), Value::from(orch.feature_name.as_str()));
        args.insert("designDocPath".into(), Value::from(orch.design_doc_path.as_str()));
        args.insert("branch".into(), Value::from(orch.branch.as_str()));
        if let Some(ref wp) = orch.worktree_path {
            args.insert("worktreePath".into(), Value::from(wp.as_str()));
        }
        args.insert("totalPhases".into(), Value::from(orch.total_phases));
        args.insert("currentPhase".into(), Value::from(orch.current_phase));
        args.insert("status".into(), Value::from(orch.status.as_str()));
        args.insert("startedAt".into(), Value::from(orch.started_at.as_str()));
        if let Some(ref ca) = orch.completed_at {
            args.insert("completedAt".into(), Value::from(ca.as_str()));
        }
        if let Some(mins) = orch.total_elapsed_mins {
            args.insert("totalElapsedMins".into(), Value::from(mins));
        }

        let result = self
            .client
            .mutation("orchestrations:upsertOrchestration", args)
            .await?;
        extract_string(result)
    }

    /// Upsert a phase record.
    pub async fn upsert_phase(&mut self, phase: &PhaseArgs) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(phase.orchestration_id.as_str()));
        args.insert("phaseNumber".into(), Value::from(phase.phase_number.as_str()));
        args.insert("status".into(), Value::from(phase.status.as_str()));
        if let Some(ref pp) = phase.plan_path {
            args.insert("planPath".into(), Value::from(pp.as_str()));
        }
        if let Some(ref gr) = phase.git_range {
            args.insert("gitRange".into(), Value::from(gr.as_str()));
        }
        if let Some(m) = phase.planning_mins {
            args.insert("planningMins".into(), Value::from(m));
        }
        if let Some(m) = phase.execution_mins {
            args.insert("executionMins".into(), Value::from(m));
        }
        if let Some(m) = phase.review_mins {
            args.insert("reviewMins".into(), Value::from(m));
        }
        if let Some(ref sa) = phase.started_at {
            args.insert("startedAt".into(), Value::from(sa.as_str()));
        }
        if let Some(ref ca) = phase.completed_at {
            args.insert("completedAt".into(), Value::from(ca.as_str()));
        }

        let result = self.client.mutation("phases:upsertPhase", args).await?;
        extract_string(result)
    }

    /// Record an orchestration event.
    pub async fn record_event(&mut self, event: &EventArgs) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("orchestrationId".into(), Value::from(event.orchestration_id.as_str()));
        if let Some(ref pn) = event.phase_number {
            args.insert("phaseNumber".into(), Value::from(pn.as_str()));
        }
        args.insert("eventType".into(), Value::from(event.event_type.as_str()));
        args.insert("source".into(), Value::from(event.source.as_str()));
        args.insert("summary".into(), Value::from(event.summary.as_str()));
        if let Some(ref d) = event.detail {
            args.insert("detail".into(), Value::from(d.as_str()));
        }
        args.insert("recordedAt".into(), Value::from(event.recorded_at.as_str()));

        let result = self.client.mutation("events:recordEvent", args).await?;
        extract_string(result)
    }

    /// Upsert a supervisor state JSON blob for this node/feature.
    pub async fn upsert_supervisor_state(
        &mut self,
        feature_name: &str,
        state_json: &str,
        updated_at: f64,
    ) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(self.node_id.as_str()));
        args.insert("featureName".into(), Value::from(feature_name));
        args.insert("stateJson".into(), Value::from(state_json));
        args.insert("updatedAt".into(), Value::from(updated_at));

        let result = self
            .client
            .mutation("supervisorStates:upsertSupervisorState", args)
            .await?;
        extract_string(result)
    }

    /// Fetch supervisor state JSON for this node/feature.
    pub async fn get_supervisor_state(
        &mut self,
        feature_name: &str,
    ) -> anyhow::Result<Option<String>> {
        let mut args = BTreeMap::new();
        args.insert("nodeId".into(), Value::from(self.node_id.as_str()));
        args.insert("featureName".into(), Value::from(feature_name));

        let result = self
            .client
            .query("supervisorStates:getSupervisorState", args)
            .await?;
        extract_optional_state_json(result)
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

fn extract_optional_state_json(result: FunctionResult) -> anyhow::Result<Option<String>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(map)) => match map.get("stateJson") {
            Some(Value::String(s)) => Ok(Some(s.clone())),
            Some(other) => anyhow::bail!("expected stateJson string, got: {:?}", other),
            None => Ok(None),
        },
        FunctionResult::Value(other) => {
            anyhow::bail!("expected object from Convex, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => anyhow::bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => anyhow::bail!("Convex error: {:?}", err),
    }
}

/// Run an async Convex operation using a one-shot tokio runtime.
pub fn run_convex<F, Fut, T>(f: F) -> anyhow::Result<T>
where
    F: FnOnce(ConvexWriter) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<T>>,
{
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let writer = ConvexWriter::connect().await?;
        f(writer).await
    })
}

/// Run an async Convex write operation using a one-shot tokio runtime.
pub fn run_convex_write<F, Fut>(f: F) -> anyhow::Result<()>
where
    F: FnOnce(ConvexWriter) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<()>>,
{
    run_convex(f)
}
