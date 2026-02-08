//! Convex-backed data source for tina-monitor
//!
//! Replaces the file-based discovery, tasks, and teams modules that were
//! previously provided by tina-data.

use std::path::PathBuf;

use anyhow::Result;
use serde::Serialize;

use tina_data::{
    OrchestrationListEntry, OrchestrationDetailResponse, PhaseRecord, TaskEventRecord,
    TeamMemberRecord, TinaConvexClient,
};

use crate::types::{Agent, Task, TaskStatus};

/// Data source backed by Convex queries.
pub struct ConvexDataSource {
    client: TinaConvexClient,
}

impl ConvexDataSource {
    /// Create a new data source connected to a Convex deployment.
    pub async fn new(deployment_url: &str) -> Result<Self> {
        let client = TinaConvexClient::new(deployment_url).await?;
        Ok(Self { client })
    }

    /// List all orchestrations.
    pub async fn list_orchestrations(&mut self) -> Result<Vec<MonitorOrchestration>> {
        let entries = self.client.list_orchestrations().await?;
        Ok(entries.into_iter().map(MonitorOrchestration::from_list_entry).collect())
    }

    /// Get full detail for an orchestration, populating tasks and members.
    pub async fn get_orchestration_detail(
        &mut self,
        orchestration_id: &str,
    ) -> Result<Option<MonitorOrchestration>> {
        let detail = self.client.get_orchestration_detail(orchestration_id).await?;
        Ok(detail.map(MonitorOrchestration::from_detail))
    }
}

/// Status of an orchestration as displayed in tina-monitor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MonitorOrchestrationStatus {
    Planning,
    Executing,
    Reviewing,
    Complete,
    Blocked,
    Idle,
}

impl MonitorOrchestrationStatus {
    fn from_str(s: &str) -> Self {
        match s {
            "planning" => Self::Planning,
            "executing" => Self::Executing,
            "reviewing" => Self::Reviewing,
            "complete" => Self::Complete,
            "blocked" => Self::Blocked,
            _ => Self::Idle,
        }
    }

    /// Convert from the tina-session OrchestrationStatus enum.
    pub fn from_orchestration_status(status: &crate::types::OrchestrationStatus) -> Self {
        use crate::types::OrchestrationStatus;
        match status {
            OrchestrationStatus::Planning => Self::Planning,
            OrchestrationStatus::Executing => Self::Executing,
            OrchestrationStatus::Reviewing => Self::Reviewing,
            OrchestrationStatus::Complete => Self::Complete,
            OrchestrationStatus::Blocked => Self::Blocked,
        }
    }
}

impl std::fmt::Display for MonitorOrchestrationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Planning => write!(f, "planning"),
            Self::Executing => write!(f, "executing"),
            Self::Reviewing => write!(f, "reviewing"),
            Self::Complete => write!(f, "complete"),
            Self::Blocked => write!(f, "blocked"),
            Self::Idle => write!(f, "idle"),
        }
    }
}

/// Orchestration as displayed in tina-monitor (maps from Convex data).
#[derive(Debug, Clone, Serialize)]
pub struct MonitorOrchestration {
    /// Convex document _id
    pub id: String,
    pub node_id: String,
    pub node_name: String,
    pub feature_name: String,
    pub cwd: PathBuf,
    pub current_phase: u32,
    pub total_phases: u32,
    pub design_doc_path: PathBuf,
    pub status: MonitorOrchestrationStatus,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub total_elapsed_mins: Option<f64>,
    pub branch: String,
    /// Phase data (populated from detail query)
    pub phases: Vec<PhaseRecord>,
    /// Tasks (materialized from TaskEventRecords)
    pub tasks: Vec<Task>,
    /// Orchestrator-level tasks (empty for now -- distinction between orchestrator
    /// and phase tasks not needed in Convex model)
    pub orchestrator_tasks: Vec<Task>,
    /// Team members
    pub members: Vec<Agent>,
}

impl MonitorOrchestration {
    /// Create from a list entry (minimal data, no tasks/members/phases).
    pub fn from_list_entry(entry: OrchestrationListEntry) -> Self {
        let cwd = entry
            .worktree_path
            .as_deref()
            .map(PathBuf::from)
            .unwrap_or_default();

        Self {
            id: entry.id,
            node_id: entry.node_id,
            node_name: entry.node_name,
            feature_name: entry.feature_name,
            cwd,
            current_phase: entry.current_phase as u32,
            total_phases: entry.total_phases as u32,
            design_doc_path: PathBuf::from(&entry.design_doc_path),
            status: MonitorOrchestrationStatus::from_str(&entry.status),
            started_at: entry.started_at,
            completed_at: entry.completed_at,
            total_elapsed_mins: entry.total_elapsed_mins,
            branch: entry.branch,
            phases: vec![],
            tasks: vec![],
            orchestrator_tasks: vec![],
            members: vec![],
        }
    }

    /// Create from a full detail response.
    pub fn from_detail(detail: OrchestrationDetailResponse) -> Self {
        let cwd = detail
            .worktree_path
            .as_deref()
            .map(PathBuf::from)
            .unwrap_or_default();

        let tasks = detail
            .tasks
            .iter()
            .map(materialize_task)
            .collect();

        let members = detail
            .team_members
            .iter()
            .map(materialize_agent)
            .collect();

        Self {
            id: detail.id,
            node_id: detail.node_id,
            node_name: detail.node_name,
            feature_name: detail.feature_name,
            cwd,
            current_phase: detail.current_phase as u32,
            total_phases: detail.total_phases as u32,
            design_doc_path: PathBuf::from(&detail.design_doc_path),
            status: MonitorOrchestrationStatus::from_str(&detail.status),
            started_at: detail.started_at,
            completed_at: detail.completed_at,
            total_elapsed_mins: detail.total_elapsed_mins,
            branch: detail.branch,
            phases: detail.phases,
            tasks,
            orchestrator_tasks: vec![],
            members,
        }
    }

    /// Count completed tasks.
    pub fn tasks_completed(&self) -> usize {
        self.tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Completed)
            .count()
    }

    /// Count total tasks.
    pub fn tasks_total(&self) -> usize {
        self.tasks.len()
    }

    /// Get the path to a phase plan file.
    pub fn phase_plan_path(&self, phase: u32) -> PathBuf {
        self.cwd
            .join(".claude")
            .join("tina")
            .join("plans")
            .join(format!("phase-{}-plan.md", phase))
    }

    /// Load the phase plan content for a given phase.
    pub fn load_phase_plan(&self, phase: u32) -> Option<String> {
        let path = self.phase_plan_path(phase);
        std::fs::read_to_string(&path).ok()
    }

    /// Load tasks and members for a specific phase.
    /// Filters the already-loaded tasks and members by phase number.
    pub fn load_phase_data(&self, phase: u32) -> (Vec<Task>, Vec<Agent>) {
        let phase_str = phase.to_string();

        let phase_tasks: Vec<Task> = self
            .tasks
            .iter()
            .filter(|_t| {
                // All tasks belong to the orchestration; phase filtering
                // would need task metadata. For now, return all tasks.
                true
            })
            .cloned()
            .collect();

        let phase_members: Vec<Agent> = self
            .members
            .iter()
            .filter(|_a| {
                // Members are phase-scoped in Convex but we don't have
                // the phase_number on the Agent struct. Return all for now.
                true
            })
            .cloned()
            .collect();

        let _ = phase_str; // avoid unused warning
        (phase_tasks, phase_members)
    }

    /// Backward-compatible field: team_name derived from feature_name
    pub fn team_name(&self) -> String {
        format!("{}-orchestration", self.feature_name)
    }

    /// Backward-compatible field: title derived from feature_name
    pub fn title(&self) -> String {
        self.feature_name.clone()
    }
}

/// Convert a TaskEventRecord to a tina-session Task.
fn materialize_task(event: &TaskEventRecord) -> Task {
    let status = match event.status.as_str() {
        "in_progress" => TaskStatus::InProgress,
        "completed" => TaskStatus::Completed,
        _ => TaskStatus::Pending,
    };

    let blocked_by: Vec<String> = event
        .blocked_by
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    let metadata: serde_json::Value = event
        .metadata
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::Value::Null);

    Task {
        id: event.task_id.clone(),
        subject: event.subject.clone(),
        description: event.description.clone().unwrap_or_default(),
        active_form: None,
        status,
        owner: event.owner.clone(),
        blocks: vec![],
        blocked_by,
        metadata,
    }
}

/// Convert a TeamMemberRecord to a tina-session Agent.
fn materialize_agent(member: &TeamMemberRecord) -> Agent {
    Agent {
        agent_id: format!("convex-{}", member.agent_name),
        name: member.agent_name.clone(),
        agent_type: member.agent_type.clone(),
        model: member.model.clone().unwrap_or_else(|| "unknown".to_string()),
        joined_at: member
            .joined_at
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.timestamp_millis())
            .unwrap_or(0),
        tmux_pane_id: None,
        cwd: PathBuf::new(),
        subscriptions: vec![],
    }
}

/// Summary type used by the fuzzy finder overlay.
#[derive(Debug, Clone)]
pub struct OrchestrationSummary {
    pub feature: String,
    pub worktree_path: PathBuf,
    pub status: MonitorOrchestrationStatus,
    pub current_phase: u32,
    pub total_phases: u32,
    pub elapsed_mins: Option<f64>,
}

impl From<&MonitorOrchestration> for OrchestrationSummary {
    fn from(orch: &MonitorOrchestration) -> Self {
        Self {
            feature: orch.feature_name.clone(),
            worktree_path: orch.cwd.clone(),
            status: orch.status.clone(),
            current_phase: orch.current_phase,
            total_phases: orch.total_phases,
            elapsed_mins: orch.total_elapsed_mins,
        }
    }
}

/// Task summary for CLI output (replaces tina_data::tasks::TaskSummary).
#[derive(Debug, Clone, Serialize)]
pub struct TaskSummary {
    pub total: usize,
    pub completed: usize,
    pub in_progress: usize,
    pub pending: usize,
    pub blocked: usize,
}

impl TaskSummary {
    pub fn from_tasks(tasks: &[Task]) -> Self {
        let total = tasks.len();
        let completed = tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Completed)
            .count();
        let in_progress = tasks
            .iter()
            .filter(|t| t.status == TaskStatus::InProgress)
            .count();
        let blocked = tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Pending && !t.blocked_by.is_empty())
            .count();
        let pending = total - completed - in_progress;

        Self {
            total,
            completed,
            in_progress,
            pending,
            blocked,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(id: &str, status: TaskStatus, blocked_by: Vec<String>) -> Task {
        Task {
            id: id.to_string(),
            subject: format!("Task {}", id),
            description: String::new(),
            active_form: None,
            status,
            owner: None,
            blocks: vec![],
            blocked_by,
            metadata: serde_json::Value::Null,
        }
    }

    #[test]
    fn status_from_str_parses_known_values() {
        assert_eq!(
            MonitorOrchestrationStatus::from_str("executing"),
            MonitorOrchestrationStatus::Executing
        );
        assert_eq!(
            MonitorOrchestrationStatus::from_str("planning"),
            MonitorOrchestrationStatus::Planning
        );
        assert_eq!(
            MonitorOrchestrationStatus::from_str("reviewing"),
            MonitorOrchestrationStatus::Reviewing
        );
        assert_eq!(
            MonitorOrchestrationStatus::from_str("complete"),
            MonitorOrchestrationStatus::Complete
        );
        assert_eq!(
            MonitorOrchestrationStatus::from_str("blocked"),
            MonitorOrchestrationStatus::Blocked
        );
        assert_eq!(
            MonitorOrchestrationStatus::from_str("unknown"),
            MonitorOrchestrationStatus::Idle
        );
    }

    #[test]
    fn monitor_orchestration_from_list_entry() {
        let entry = OrchestrationListEntry {
            id: "orch-1".to_string(),
            node_id: "node-1".to_string(),
            node_name: "macbook".to_string(),
            feature_name: "auth-system".to_string(),
            design_doc_path: "docs/auth.md".to_string(),
            branch: "tina/auth".to_string(),
            worktree_path: Some("/path/to/worktree".to_string()),
            total_phases: 3,
            current_phase: 2,
            status: "executing".to_string(),
            started_at: "2026-02-07T10:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: Some(45.0),
        };

        let orch = MonitorOrchestration::from_list_entry(entry);
        assert_eq!(orch.feature_name, "auth-system");
        assert_eq!(orch.current_phase, 2);
        assert_eq!(orch.total_phases, 3);
        assert_eq!(orch.cwd, PathBuf::from("/path/to/worktree"));
        assert_eq!(orch.status, MonitorOrchestrationStatus::Executing);
        assert_eq!(orch.team_name(), "auth-system-orchestration");
    }

    #[test]
    fn tasks_completed_counts_correctly() {
        let entry = OrchestrationListEntry {
            id: "orch-1".to_string(),
            node_id: "node-1".to_string(),
            node_name: "macbook".to_string(),
            feature_name: "test".to_string(),
            design_doc_path: "docs/test.md".to_string(),
            branch: "tina/test".to_string(),
            worktree_path: None,
            total_phases: 1,
            current_phase: 1,
            status: "executing".to_string(),
            started_at: "2026-02-07T10:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: None,
        };

        let mut orch = MonitorOrchestration::from_list_entry(entry);
        orch.tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::InProgress, vec![]),
            make_task("3", TaskStatus::Pending, vec![]),
        ];

        assert_eq!(orch.tasks_completed(), 1);
        assert_eq!(orch.tasks_total(), 3);
    }

    #[test]
    fn materialize_task_parses_correctly() {
        let event = TaskEventRecord {
            orchestration_id: "orch-1".to_string(),
            phase_number: Some("1".to_string()),
            task_id: "42".to_string(),
            subject: "Build auth module".to_string(),
            description: Some("Implement the auth module".to_string()),
            status: "in_progress".to_string(),
            owner: Some("executor-1".to_string()),
            blocked_by: Some("[\"41\"]".to_string()),
            metadata: Some("{}".to_string()),
            recorded_at: "2026-02-07T10:00:00Z".to_string(),
        };

        let task = materialize_task(&event);
        assert_eq!(task.id, "42");
        assert_eq!(task.subject, "Build auth module");
        assert_eq!(task.status, TaskStatus::InProgress);
        assert_eq!(task.owner, Some("executor-1".to_string()));
        assert_eq!(task.blocked_by, vec!["41".to_string()]);
    }

    #[test]
    fn materialize_agent_parses_correctly() {
        let member = TeamMemberRecord {
            orchestration_id: "orch-1".to_string(),
            phase_number: "1".to_string(),
            agent_name: "executor-1".to_string(),
            agent_type: Some("executor".to_string()),
            model: Some("claude-opus-4-6".to_string()),
            joined_at: Some("2026-02-07T10:00:00Z".to_string()),
            recorded_at: "2026-02-07T10:00:00Z".to_string(),
        };

        let agent = materialize_agent(&member);
        assert_eq!(agent.name, "executor-1");
        assert_eq!(agent.agent_type, Some("executor".to_string()));
        assert_eq!(agent.model, "claude-opus-4-6");
    }

    #[test]
    fn task_summary_counts_correctly() {
        let tasks = vec![
            make_task("1", TaskStatus::Completed, vec![]),
            make_task("2", TaskStatus::InProgress, vec![]),
            make_task("3", TaskStatus::Pending, vec![]),
            make_task("4", TaskStatus::Pending, vec!["1".to_string()]),
        ];

        let summary = TaskSummary::from_tasks(&tasks);
        assert_eq!(summary.total, 4);
        assert_eq!(summary.completed, 1);
        assert_eq!(summary.in_progress, 1);
        assert_eq!(summary.pending, 2);
        assert_eq!(summary.blocked, 1);
    }

    #[test]
    fn orchestration_summary_from_monitor_orchestration() {
        let entry = OrchestrationListEntry {
            id: "orch-1".to_string(),
            node_id: "node-1".to_string(),
            node_name: "macbook".to_string(),
            feature_name: "auth-system".to_string(),
            design_doc_path: "docs/auth.md".to_string(),
            branch: "tina/auth".to_string(),
            worktree_path: Some("/path/to/worktree".to_string()),
            total_phases: 3,
            current_phase: 2,
            status: "executing".to_string(),
            started_at: "2026-02-07T10:00:00Z".to_string(),
            completed_at: None,
            total_elapsed_mins: Some(45.0),
        };

        let orch = MonitorOrchestration::from_list_entry(entry);
        let summary = OrchestrationSummary::from(&orch);
        assert_eq!(summary.feature, "auth-system");
        assert_eq!(summary.current_phase, 2);
        assert_eq!(summary.total_phases, 3);
        assert_eq!(summary.status, MonitorOrchestrationStatus::Executing);
    }
}
