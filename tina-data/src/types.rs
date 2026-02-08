use serde::{Deserialize, Serialize};

/// Registration data for a node (laptop).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeRegistration {
    pub name: String,
    pub os: String,
    pub auth_token_hash: String,
}

/// Orchestration record matching the Convex `orchestrations` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationRecord {
    pub node_id: String,
    pub feature_name: String,
    pub design_doc_path: String,
    pub branch: String,
    pub worktree_path: Option<String>,
    pub total_phases: i64,
    pub current_phase: i64,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub total_elapsed_mins: Option<f64>,
}

/// Phase record matching the Convex `phases` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseRecord {
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

/// Task event record matching the Convex `taskEvents` table (append-only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEventRecord {
    pub orchestration_id: String,
    pub phase_number: Option<String>,
    pub task_id: String,
    pub subject: String,
    pub description: Option<String>,
    pub status: String,
    pub owner: Option<String>,
    pub blocked_by: Option<String>,
    pub metadata: Option<String>,
    pub recorded_at: String,
}

/// Orchestration event record matching the Convex `orchestrationEvents` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationEventRecord {
    pub orchestration_id: String,
    pub phase_number: Option<String>,
    pub event_type: String,
    pub source: String,
    pub summary: String,
    pub detail: Option<String>,
    pub recorded_at: String,
}

/// Team member record matching the Convex `teamMembers` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMemberRecord {
    pub orchestration_id: String,
    pub phase_number: String,
    pub agent_name: String,
    pub agent_type: Option<String>,
    pub model: Option<String>,
    pub joined_at: Option<String>,
    pub recorded_at: String,
}

/// An inbound action from the Convex `inboundActions` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboundAction {
    pub id: String,
    pub node_id: String,
    pub orchestration_id: String,
    pub action_type: String,
    pub payload: String,
    pub status: String,
    pub created_at: f64,
}

/// Result of claiming an inbound action.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaimResult {
    pub success: bool,
    pub reason: Option<String>,
}
