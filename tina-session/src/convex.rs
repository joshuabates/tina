use convex::{FunctionResult, QuerySubscription, Value};
use sha2::{Digest, Sha256};

use crate::config;

pub type OrchestrationArgs = tina_data::OrchestrationRecord;
pub type PhaseArgs = tina_data::PhaseRecord;
pub type EventArgs = tina_data::OrchestrationEventRecord;
pub type UpsertTeamMemberArgs = tina_data::TeamMemberRecord;
pub type RegisterTeamArgs = tina_data::RegisterTeamRecord;

/// Orchestration record returned from Convex feature/list queries.
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

/// Phase status record returned from Convex phase status query/subscription.
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
pub struct ConvexWriter {
    client: tina_data::TinaConvexClient,
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
        let node_name = cfg.node_name.filter(|n| !n.is_empty()).unwrap_or_else(|| {
            hostname::get()
                .ok()
                .and_then(|h| h.into_string().ok())
                .unwrap_or_else(|| "unknown".to_string())
        });

        let mut client = tina_data::TinaConvexClient::new(&url).await?;
        let registration = tina_data::NodeRegistration {
            name: node_name,
            os: std::env::consts::OS.to_string(),
            auth_token_hash: hash_token(&token),
        };
        let node_id = client.register_node(&registration).await?;

        Ok(Self { client, node_id })
    }

    /// Returns this writer's registered node ID.
    pub fn node_id(&self) -> &str {
        &self.node_id
    }

    /// Find or create a project by repo path.
    pub async fn find_or_create_project(
        &mut self,
        name: &str,
        repo_path: &str,
    ) -> anyhow::Result<String> {
        self.client.find_or_create_project(name, repo_path).await
    }

    /// Upsert an orchestration record.
    pub async fn upsert_orchestration(
        &mut self,
        orch: &OrchestrationArgs,
    ) -> anyhow::Result<String> {
        self.client.upsert_orchestration(orch).await
    }

    /// Upsert a phase record.
    pub async fn upsert_phase(&mut self, phase: &PhaseArgs) -> anyhow::Result<String> {
        self.client.upsert_phase(phase).await
    }

    /// Record an orchestration event.
    pub async fn record_event(&mut self, event: &EventArgs) -> anyhow::Result<String> {
        self.client.record_event(event).await
    }

    /// Upsert supervisor state JSON for this node/feature pair.
    pub async fn upsert_supervisor_state(
        &mut self,
        feature_name: &str,
        state_json: &str,
        updated_at: f64,
    ) -> anyhow::Result<String> {
        self.client
            .upsert_supervisor_state(&self.node_id, feature_name, state_json, updated_at)
            .await
    }

    /// Upsert a team member record.
    pub async fn upsert_team_member(
        &mut self,
        member: &UpsertTeamMemberArgs,
    ) -> anyhow::Result<String> {
        self.client.upsert_team_member(member).await
    }

    /// Register a team in Convex.
    pub async fn register_team(&mut self, team: &RegisterTeamArgs) -> anyhow::Result<String> {
        self.client.register_team(team).await
    }

    /// Get the latest orchestration for a feature name.
    pub async fn get_by_feature(
        &mut self,
        feature_name: &str,
    ) -> anyhow::Result<Option<OrchestrationRecord>> {
        let record = self.client.get_by_feature(feature_name).await?;
        Ok(record.map(convert_feature_orchestration))
    }

    /// Get phase status for an orchestration + phase number.
    pub async fn get_phase_status(
        &mut self,
        orchestration_id: &str,
        phase_number: &str,
    ) -> anyhow::Result<Option<PhaseStatusRecord>> {
        let record = self
            .client
            .get_phase_status(orchestration_id, phase_number)
            .await?;
        Ok(record.map(convert_phase_record))
    }

    /// Subscribe to phase status updates.
    pub async fn subscribe_phase_status(
        &mut self,
        orchestration_id: &str,
        phase_number: &str,
    ) -> anyhow::Result<QuerySubscription> {
        self.client
            .subscribe_phase_status(orchestration_id, phase_number)
            .await
    }

    /// List all orchestrations.
    pub async fn list_orchestrations(&mut self) -> anyhow::Result<Vec<OrchestrationRecord>> {
        let entries = self.client.list_orchestrations().await?;
        Ok(entries.into_iter().map(convert_list_entry).collect())
    }

    /// Fetch supervisor state JSON for this node/feature pair.
    pub async fn get_supervisor_state(
        &mut self,
        feature_name: &str,
    ) -> anyhow::Result<Option<String>> {
        self.client
            .get_supervisor_state(&self.node_id, feature_name)
            .await
    }
}

fn convert_list_entry(entry: tina_data::OrchestrationListEntry) -> OrchestrationRecord {
    OrchestrationRecord {
        id: entry.id,
        feature_name: entry.record.feature_name,
        worktree_path: entry.record.worktree_path,
        branch: entry.record.branch,
        design_doc_path: entry.record.design_doc_path,
        total_phases: entry.record.total_phases as u32,
        current_phase: entry.record.current_phase as u32,
        status: entry.record.status,
        started_at: entry.record.started_at,
    }
}

fn convert_feature_orchestration(
    record: tina_data::FeatureOrchestrationRecord,
) -> OrchestrationRecord {
    OrchestrationRecord {
        id: record.id,
        feature_name: record.record.feature_name,
        worktree_path: record.record.worktree_path,
        branch: record.record.branch,
        design_doc_path: record.record.design_doc_path,
        total_phases: record.record.total_phases as u32,
        current_phase: record.record.current_phase as u32,
        status: record.record.status,
        started_at: record.record.started_at,
    }
}

fn convert_phase_record(record: tina_data::PhaseRecord) -> PhaseStatusRecord {
    PhaseStatusRecord {
        orchestration_id: record.orchestration_id,
        phase_number: record.phase_number,
        status: record.status,
        plan_path: record.plan_path,
        git_range: record.git_range,
        started_at: record.started_at,
        completed_at: record.completed_at,
    }
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Parse a FunctionResult containing phase status object (subscription payload).
pub fn parse_phase_status(result: FunctionResult) -> anyhow::Result<Option<PhaseStatusRecord>> {
    match result {
        FunctionResult::Value(Value::Null) => Ok(None),
        FunctionResult::Value(Value::Object(map)) => Ok(Some(PhaseStatusRecord {
            orchestration_id: match map.get("orchestrationId") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing orchestrationId in phase"),
            },
            phase_number: match map.get("phaseNumber") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing phaseNumber in phase"),
            },
            status: match map.get("status") {
                Some(Value::String(s)) => s.clone(),
                _ => anyhow::bail!("missing status in phase"),
            },
            plan_path: map.get("planPath").and_then(|v| match v {
                Value::String(s) => Some(s.clone()),
                _ => None,
            }),
            git_range: map.get("gitRange").and_then(|v| match v {
                Value::String(s) => Some(s.clone()),
                _ => None,
            }),
            started_at: map.get("startedAt").and_then(|v| match v {
                Value::String(s) => Some(s.clone()),
                _ => None,
            }),
            completed_at: map.get("completedAt").and_then(|v| match v {
                Value::String(s) => Some(s.clone()),
                _ => None,
            }),
        })),
        FunctionResult::Value(other) => {
            anyhow::bail!(
                "expected object or null from getPhaseStatus, got: {:?}",
                other
            )
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
