use serde::{Deserialize, Serialize};

pub use crate::generated::orchestration_core_fields::OrchestrationRecord;

/// Registration data for a node (laptop).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeRegistration {
    pub name: String,
    pub os: String,
    pub auth_token_hash: String,
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

/// Team registration input (for `teams:registerTeam`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterTeamRecord {
    pub team_name: String,
    pub orchestration_id: String,
    pub lead_session_id: String,
    pub tmux_session_name: Option<String>,
    pub phase_number: Option<String>,
    pub parent_team_id: Option<String>,
    pub created_at: f64,
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

// --- Query response types (returned by Convex queries) ---

/// Node record as returned by `listNodes` query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeRecord {
    pub id: String,
    pub name: String,
    pub os: String,
    pub status: String,
    pub last_heartbeat: f64,
    pub registered_at: f64,
}

/// Orchestration list entry as returned by `listOrchestrations` query.
/// Extends `OrchestrationRecord` with a resolved `node_name` and Convex `_id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationListEntry {
    pub id: String,
    pub node_name: String,
    #[serde(flatten)]
    pub record: OrchestrationRecord,
}

/// Team record as returned by `teams:getByTeamName` query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamRecord {
    pub id: String,
    pub team_name: String,
    pub orchestration_id: String,
    pub lead_session_id: String,
    pub tmux_session_name: Option<String>,
    pub phase_number: Option<String>,
    pub parent_team_id: Option<String>,
    pub created_at: f64,
}

/// Active team record as returned by `teams:listActiveTeams` query.
/// Extends `TeamRecord` with orchestration context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveTeamRecord {
    pub id: String,
    pub team_name: String,
    pub orchestration_id: String,
    pub lead_session_id: String,
    pub tmux_session_name: Option<String>,
    pub phase_number: Option<String>,
    pub parent_team_id: Option<String>,
    pub created_at: f64,
    pub orchestration_status: String,
    pub feature_name: String,
}

/// Full orchestration detail as returned by `getOrchestrationDetail` query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationDetailResponse {
    pub id: String,
    pub node_name: String,
    #[serde(flatten)]
    pub record: OrchestrationRecord,
    pub phases: Vec<PhaseRecord>,
    pub tasks: Vec<TaskEventRecord>,
    pub team_members: Vec<TeamMemberRecord>,
}

/// Orchestration as returned by `orchestrations:getByFeature`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureOrchestrationRecord {
    pub id: String,
    #[serde(flatten)]
    pub record: OrchestrationRecord,
}

/// Git commit record for Convex `commits` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitRecord {
    pub orchestration_id: String,
    pub phase_number: String,
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    pub timestamp: String,
    pub insertions: u32,
    pub deletions: u32,
}

/// Plan record for Convex `plans` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanRecord {
    pub orchestration_id: String,
    pub phase_number: String,
    pub plan_path: String,
    pub content: String,
}

/// Telemetry span record matching the Convex `telemetrySpans` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpanRecord {
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: Option<String>,
    pub orchestration_id: Option<String>,
    pub feature_name: Option<String>,
    pub phase_number: Option<String>,
    pub team_name: Option<String>,
    pub task_id: Option<String>,
    pub source: String,
    pub operation: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_ms: Option<f64>,
    pub status: String,
    pub error_code: Option<String>,
    pub error_detail: Option<String>,
    pub attrs: Option<String>,
    pub recorded_at: String,
}

/// Telemetry event record matching the Convex `telemetryEvents` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: Option<String>,
    pub orchestration_id: Option<String>,
    pub feature_name: Option<String>,
    pub phase_number: Option<String>,
    pub team_name: Option<String>,
    pub task_id: Option<String>,
    pub source: String,
    pub event_type: String,
    pub severity: String,
    pub message: String,
    pub status: Option<String>,
    pub attrs: Option<String>,
    pub recorded_at: String,
}

/// Telemetry rollup record matching the Convex `telemetryRollups` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollupRecord {
    pub window_start: String,
    pub window_end: String,
    pub granularity_min: i32,
    pub source: String,
    pub operation: String,
    pub orchestration_id: Option<String>,
    pub phase_number: Option<String>,
    pub span_count: i32,
    pub error_count: i32,
    pub event_count: i32,
    pub p95_duration_ms: Option<f64>,
    pub max_duration_ms: Option<f64>,
}

/// Design record for Convex `designs` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignRecord {
    pub id: String,
    pub project_id: String,
    pub design_key: String,
    pub title: String,
    pub markdown: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

/// Ticket record for Convex `tickets` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TicketRecord {
    pub id: String,
    pub project_id: String,
    pub design_id: Option<String>,
    pub ticket_key: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub assignee: Option<String>,
    pub estimate: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: Option<String>,
}

/// Work comment record for Convex `workComments` table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommentRecord {
    pub id: String,
    pub project_id: String,
    pub target_type: String,
    pub target_id: String,
    pub author_type: String,
    pub author_name: String,
    pub body: String,
    pub created_at: String,
    pub edited_at: Option<String>,
}

/// Input record for creating a feedback entry via Convex `feedbackEntries:createFeedbackEntry`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackEntryInput {
    pub orchestration_id: String,
    pub target_type: String,
    pub target_task_id: Option<String>,
    pub target_commit_sha: Option<String>,
    pub entry_type: String,
    pub body: String,
    pub author_type: String,
    pub author_name: String,
}

/// Response record as returned by Convex feedback entry queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackEntryRecord {
    pub id: String,
    pub orchestration_id: String,
    pub target_type: String,
    pub target_task_id: Option<String>,
    pub target_commit_sha: Option<String>,
    pub entry_type: String,
    pub body: String,
    pub author_type: String,
    pub author_name: String,
    pub status: String,
    pub resolved_by: Option<String>,
    pub resolved_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Blocking feedback summary as returned by `feedbackEntries:getBlockingFeedbackSummary`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingFeedbackSummary {
    pub total_blocking: u32,
    pub by_target_type: BlockingByTargetType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingByTargetType {
    pub task: u32,
    pub commit: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feedback_entry_input_round_trip() {
        let input = FeedbackEntryInput {
            orchestration_id: "orch-1".into(),
            target_type: "task".into(),
            target_task_id: Some("task-42".into()),
            target_commit_sha: None,
            entry_type: "ask_for_change".into(),
            body: "Please fix the naming".into(),
            author_type: "human".into(),
            author_name: "alice".into(),
        };
        let json = serde_json::to_string(&input).unwrap();
        let deserialized: FeedbackEntryInput = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.orchestration_id, "orch-1");
        assert_eq!(deserialized.target_type, "task");
        assert_eq!(deserialized.target_task_id, Some("task-42".into()));
        assert!(deserialized.target_commit_sha.is_none());
        assert_eq!(deserialized.entry_type, "ask_for_change");
        assert_eq!(deserialized.body, "Please fix the naming");
    }

    #[test]
    fn feedback_entry_record_round_trip() {
        let record = FeedbackEntryRecord {
            id: "entry-1".into(),
            orchestration_id: "orch-1".into(),
            target_type: "commit".into(),
            target_task_id: None,
            target_commit_sha: Some("abc123".into()),
            entry_type: "comment".into(),
            body: "Looks good".into(),
            author_type: "agent".into(),
            author_name: "reviewer-bot".into(),
            status: "open".into(),
            resolved_by: None,
            resolved_at: None,
            created_at: "2026-02-12T10:00:00Z".into(),
            updated_at: "2026-02-12T10:00:00Z".into(),
        };
        let json = serde_json::to_string(&record).unwrap();
        let deserialized: FeedbackEntryRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "entry-1");
        assert_eq!(deserialized.target_type, "commit");
        assert_eq!(deserialized.target_commit_sha, Some("abc123".into()));
        assert!(deserialized.target_task_id.is_none());
        assert_eq!(deserialized.status, "open");
        assert!(deserialized.resolved_by.is_none());
    }

    #[test]
    fn feedback_entry_record_resolved_state() {
        let record = FeedbackEntryRecord {
            id: "entry-2".into(),
            orchestration_id: "orch-1".into(),
            target_type: "task".into(),
            target_task_id: Some("task-5".into()),
            target_commit_sha: None,
            entry_type: "suggestion".into(),
            body: "Consider using a constant".into(),
            author_type: "human".into(),
            author_name: "bob".into(),
            status: "resolved".into(),
            resolved_by: Some("bob".into()),
            resolved_at: Some("2026-02-12T12:00:00Z".into()),
            created_at: "2026-02-12T10:00:00Z".into(),
            updated_at: "2026-02-12T12:00:00Z".into(),
        };
        let json = serde_json::to_string(&record).unwrap();
        let deserialized: FeedbackEntryRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.status, "resolved");
        assert_eq!(deserialized.resolved_by, Some("bob".into()));
        assert_eq!(deserialized.resolved_at, Some("2026-02-12T12:00:00Z".into()));
    }

    #[test]
    fn blocking_feedback_summary_round_trip() {
        let summary = BlockingFeedbackSummary {
            total_blocking: 5,
            by_target_type: BlockingByTargetType {
                task: 3,
                commit: 2,
            },
        };
        let json = serde_json::to_string(&summary).unwrap();
        let deserialized: BlockingFeedbackSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.total_blocking, 5);
        assert_eq!(deserialized.by_target_type.task, 3);
        assert_eq!(deserialized.by_target_type.commit, 2);
    }
}
