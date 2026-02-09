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

/// Team member upsert data for Convex.
pub struct UpsertTeamMemberArgs {
    pub orchestration_id: String,
    pub phase_number: String,
    pub agent_name: String,
    pub agent_type: Option<String>,
    pub model: Option<String>,
    pub joined_at: Option<String>,
    pub recorded_at: String,
}

/// Team registration data for Convex.
pub struct RegisterTeamArgs {
    pub team_name: String,
    pub orchestration_id: String,
    pub lead_session_id: String,
    pub phase_number: Option<String>,
    pub parent_team_id: Option<String>,
    pub created_at: f64,
}

/// Orchestration record returned from Convex queries.
#[derive(Debug, Clone)]
pub struct OrchestrationRecord {
    pub id: String,
    pub feature_name: String,
    pub worktree_path: Option<String>,
    pub branch: String,
    pub design_doc_path: String,
    pub total_phases: u32,
    pub current_phase: u32,
    pub status: String,
    pub started_at: String,
}

/// Phase status record returned from Convex queries.
#[derive(Debug, Clone)]
pub struct PhaseStatusRecord {
    pub orchestration_id: String,
    pub phase_number: String,
    pub status: String,
    pub plan_path: Option<String>,
    pub git_range: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
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
        args.insert("os".into(), Value::from(std::env::consts::OS));
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

    /// Upsert a team member record. Returns the team member doc ID.
    pub async fn upsert_team_member(
        &mut self,
        args: &UpsertTeamMemberArgs,
    ) -> anyhow::Result<String> {
        let mut map = BTreeMap::new();
        map.insert(
            "orchestrationId".into(),
            Value::from(args.orchestration_id.as_str()),
        );
        map.insert(
            "phaseNumber".into(),
            Value::from(args.phase_number.as_str()),
        );
        map.insert(
            "agentName".into(),
            Value::from(args.agent_name.as_str()),
        );
        if let Some(ref at) = args.agent_type {
            map.insert("agentType".into(), Value::from(at.as_str()));
        }
        if let Some(ref m) = args.model {
            map.insert("model".into(), Value::from(m.as_str()));
        }
        if let Some(ref ja) = args.joined_at {
            map.insert("joinedAt".into(), Value::from(ja.as_str()));
        }
        map.insert(
            "recordedAt".into(),
            Value::from(args.recorded_at.as_str()),
        );

        let result = self
            .client
            .mutation("teamMembers:upsertTeamMember", map)
            .await?;
        extract_string(result)
    }

    /// Register a team in Convex. Returns the team doc ID.
    pub async fn register_team(&mut self, team: &RegisterTeamArgs) -> anyhow::Result<String> {
        let mut args = BTreeMap::new();
        args.insert("teamName".into(), Value::from(team.team_name.as_str()));
        args.insert(
            "orchestrationId".into(),
            Value::from(team.orchestration_id.as_str()),
        );
        args.insert(
            "leadSessionId".into(),
            Value::from(team.lead_session_id.as_str()),
        );
        if let Some(ref pn) = team.phase_number {
            args.insert("phaseNumber".into(), Value::from(pn.as_str()));
        }
        if let Some(ref ptid) = team.parent_team_id {
            args.insert("parentTeamId".into(), Value::from(ptid.as_str()));
        }
        args.insert("createdAt".into(), Value::from(team.created_at));

        let result = self
            .client
            .mutation("teams:registerTeam", args)
            .await?;
        extract_string(result)
    }

    /// Get the latest orchestration for a feature name.
    pub async fn get_by_feature(
        &mut self,
        feature_name: &str,
    ) -> anyhow::Result<Option<OrchestrationRecord>> {
        let mut args = BTreeMap::new();
        args.insert("featureName".into(), Value::from(feature_name));

        let result = self
            .client
            .query("orchestrations:getByFeature", args)
            .await?;
        extract_optional_orchestration(result)
    }

    /// Get phase status for an orchestration + phase number.
    pub async fn get_phase_status(
        &mut self,
        orchestration_id: &str,
        phase_number: &str,
    ) -> anyhow::Result<Option<PhaseStatusRecord>> {
        let mut args = BTreeMap::new();
        args.insert(
            "orchestrationId".into(),
            Value::from(orchestration_id),
        );
        args.insert("phaseNumber".into(), Value::from(phase_number));

        let result = self
            .client
            .query("phases:getPhaseStatus", args)
            .await?;
        extract_optional_phase_status(result)
    }

    /// Subscribe to phase status updates. Returns the underlying ConvexClient
    /// subscribe handle for streaming.
    pub async fn subscribe_phase_status(
        &mut self,
        orchestration_id: &str,
        phase_number: &str,
    ) -> anyhow::Result<convex::QuerySubscription> {
        let mut args = BTreeMap::new();
        args.insert(
            "orchestrationId".into(),
            Value::from(orchestration_id),
        );
        args.insert("phaseNumber".into(), Value::from(phase_number));

        self.client
            .subscribe("phases:getPhaseStatus", args)
            .await
    }

    /// List all orchestrations from Convex.
    pub async fn list_orchestrations(&mut self) -> anyhow::Result<Vec<OrchestrationRecord>> {
        let result = self
            .client
            .query("orchestrations:listOrchestrations", BTreeMap::new())
            .await?;
        extract_orchestration_list(result)
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

fn extract_optional_orchestration(
    result: FunctionResult,
) -> anyhow::Result<Option<OrchestrationRecord>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(map)) => {
            let id = match map.get("_id") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing _id in orchestration"),
            };
            let feature_name = match map.get("featureName") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing featureName in orchestration"),
            };
            let worktree_path = map
                .get("worktreePath")
                .and_then(|v| if let Value::String(s) = v { Some(s.clone()) } else { None });
            let branch = match map.get("branch") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing branch in orchestration"),
            };
            let design_doc_path = match map.get("designDocPath") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing designDocPath in orchestration"),
            };
            let total_phases = match map.get("totalPhases") {
                Some(Value::Float64(n)) => *n as u32,
                Some(Value::Int64(n)) => *n as u32,
                _ => anyhow::bail!("missing totalPhases in orchestration"),
            };
            let current_phase = match map.get("currentPhase") {
                Some(Value::Float64(n)) => *n as u32,
                Some(Value::Int64(n)) => *n as u32,
                _ => anyhow::bail!("missing currentPhase in orchestration"),
            };
            let status = match map.get("status") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing status in orchestration"),
            };
            let started_at = match map.get("startedAt") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing startedAt in orchestration"),
            };
            Ok(Some(OrchestrationRecord {
                id,
                feature_name,
                worktree_path,
                branch,
                design_doc_path,
                total_phases,
                current_phase,
                status,
                started_at,
            }))
        }
        FunctionResult::Value(other) => {
            anyhow::bail!("expected object or null from getByFeature, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => anyhow::bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => anyhow::bail!("Convex error: {:?}", err),
    }
}

fn extract_optional_phase_status(
    result: FunctionResult,
) -> anyhow::Result<Option<PhaseStatusRecord>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(map)) => {
            let orchestration_id = match map.get("orchestrationId") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing orchestrationId in phase"),
            };
            let phase_number = match map.get("phaseNumber") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing phaseNumber in phase"),
            };
            let status = match map.get("status") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing status in phase"),
            };
            let plan_path = map
                .get("planPath")
                .and_then(|v| if let Value::String(s) = v { Some(s.clone()) } else { None });
            let git_range = map
                .get("gitRange")
                .and_then(|v| if let Value::String(s) = v { Some(s.clone()) } else { None });
            let started_at = map
                .get("startedAt")
                .and_then(|v| if let Value::String(s) = v { Some(s.clone()) } else { None });
            let completed_at = map
                .get("completedAt")
                .and_then(|v| if let Value::String(s) = v { Some(s.clone()) } else { None });
            Ok(Some(PhaseStatusRecord {
                orchestration_id,
                phase_number,
                status,
                plan_path,
                git_range,
                started_at,
                completed_at,
            }))
        }
        FunctionResult::Value(other) => {
            anyhow::bail!("expected object or null from getPhaseStatus, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => anyhow::bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => anyhow::bail!("Convex error: {:?}", err),
    }
}

/// Parse a FunctionResult containing a phase status object (from subscription stream).
pub fn parse_phase_status(result: FunctionResult) -> anyhow::Result<Option<PhaseStatusRecord>> {
    extract_optional_phase_status(result)
}

fn extract_orchestration_list(
    result: FunctionResult,
) -> anyhow::Result<Vec<OrchestrationRecord>> {
    match result {
        FunctionResult::Value(Value::Array(arr)) => {
            let mut records = Vec::new();
            for item in arr {
                if let Value::Object(map) = item {
                    let id = match map.get("_id") {
                        Some(Value::String(s)) => s.clone(),
                        _ => continue,
                    };
                    let feature_name = match map.get("featureName") {
                        Some(Value::String(s)) => s.clone(),
                        _ => continue,
                    };
                    let worktree_path = map
                        .get("worktreePath")
                        .and_then(|v| {
                            if let Value::String(s) = v { Some(s.clone()) } else { None }
                        });
                    let branch = match map.get("branch") {
                        Some(Value::String(s)) => s.clone(),
                        _ => continue,
                    };
                    let design_doc_path = match map.get("designDocPath") {
                        Some(Value::String(s)) => s.clone(),
                        _ => continue,
                    };
                    let total_phases = match map.get("totalPhases") {
                        Some(Value::Float64(n)) => *n as u32,
                        Some(Value::Int64(n)) => *n as u32,
                        _ => continue,
                    };
                    let current_phase = match map.get("currentPhase") {
                        Some(Value::Float64(n)) => *n as u32,
                        Some(Value::Int64(n)) => *n as u32,
                        _ => continue,
                    };
                    let status = match map.get("status") {
                        Some(Value::String(s)) => s.clone(),
                        _ => continue,
                    };
                    let started_at = match map.get("startedAt") {
                        Some(Value::String(s)) => s.clone(),
                        _ => continue,
                    };
                    records.push(OrchestrationRecord {
                        id,
                        feature_name,
                        worktree_path,
                        branch,
                        design_doc_path,
                        total_phases,
                        current_phase,
                        status,
                        started_at,
                    });
                }
            }
            Ok(records)
        }
        FunctionResult::Value(other) => {
            anyhow::bail!("expected array from listOrchestrations, got: {:?}", other)
        }
        FunctionResult::ErrorMessage(msg) => anyhow::bail!("Convex error: {}", msg),
        FunctionResult::ConvexError(err) => anyhow::bail!("Convex error: {:?}", err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upsert_team_member_args_construction() {
        let args = UpsertTeamMemberArgs {
            orchestration_id: "orch-123".to_string(),
            phase_number: "1".to_string(),
            agent_name: "codex-worker-1-abcd1234".to_string(),
            agent_type: Some("codex".to_string()),
            model: Some("gpt-5.3-codex".to_string()),
            joined_at: Some("2026-02-09T12:00:00Z".to_string()),
            recorded_at: "2026-02-09T12:00:00Z".to_string(),
        };
        assert_eq!(args.orchestration_id, "orch-123");
        assert_eq!(args.phase_number, "1");
        assert_eq!(args.agent_name, "codex-worker-1-abcd1234");
        assert_eq!(args.agent_type.as_deref(), Some("codex"));
        assert_eq!(args.model.as_deref(), Some("gpt-5.3-codex"));
        assert_eq!(args.joined_at.as_deref(), Some("2026-02-09T12:00:00Z"));
        assert_eq!(args.recorded_at, "2026-02-09T12:00:00Z");
    }

    #[test]
    fn upsert_team_member_args_optional_fields() {
        let args = UpsertTeamMemberArgs {
            orchestration_id: "orch-456".to_string(),
            phase_number: "2".to_string(),
            agent_name: "claude-executor-2".to_string(),
            agent_type: None,
            model: None,
            joined_at: None,
            recorded_at: "2026-02-09T12:00:00Z".to_string(),
        };
        assert!(args.agent_type.is_none());
        assert!(args.model.is_none());
        assert!(args.joined_at.is_none());
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
