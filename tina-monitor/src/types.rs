//! Type definitions for tina-monitor
//!
//! Re-exports canonical types from tina-session.

// Re-export all schema types from tina-session
pub use tina_session::state::schema::{
    Agent, ContextMetrics, OrchestrationStatus, PhaseBreakdown, PhaseState, PhaseStatus,
    SessionLookup, SupervisorState, Task, TaskStatus, Team, TimingGap, TimingStats,
};

// Re-export OrchestrationSummary from tina-data
pub use tina_data::OrchestrationSummary;

/// TeamMember is a type alias for Agent for backward compatibility.
pub type TeamMember = Agent;

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use std::path::PathBuf;

    // ====================================================================
    // SessionLookup Tests
    // ====================================================================

    #[test]
    fn session_lookup_serializes_and_deserializes() {
        let original = SessionLookup {
            feature: "feature-x".to_string(),
            cwd: PathBuf::from("/path/to/worktree"),
            created_at: Utc::now(),
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: SessionLookup = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    // ====================================================================
    // OrchestrationStatus Tests
    // ====================================================================

    #[test]
    fn orchestration_status_planning_serializes() {
        let status = OrchestrationStatus::Planning;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: OrchestrationStatus = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn orchestration_status_executing_serializes() {
        let status = OrchestrationStatus::Executing;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: OrchestrationStatus = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    // ====================================================================
    // PhaseStatus Tests
    // ====================================================================

    #[test]
    fn phase_status_planning_serializes() {
        let status = PhaseStatus::Planning;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: PhaseStatus = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    // ====================================================================
    // TaskStatus Tests
    // ====================================================================

    #[test]
    fn task_status_pending_serializes() {
        let status = TaskStatus::Pending;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: TaskStatus = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn task_status_in_progress_serializes() {
        let status = TaskStatus::InProgress;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: TaskStatus = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    // ====================================================================
    // Team/Agent Tests
    // ====================================================================

    #[test]
    fn team_member_is_alias_for_agent() {
        // This just verifies the type alias works
        let agent = Agent {
            agent_id: "agent-1".to_string(),
            name: "researcher".to_string(),
            agent_type: Some("general-purpose".to_string()),
            model: "claude-opus".to_string(),
            joined_at: 1706644800000,
            tmux_pane_id: Some("0".to_string()),
            cwd: PathBuf::from("/path/to/work"),
            subscriptions: vec![],
        };

        let _member: TeamMember = agent;
    }

    // ====================================================================
    // OrchestrationSummary Tests
    // ====================================================================

    #[test]
    fn orchestration_summary_can_be_created() {
        let summary = OrchestrationSummary {
            feature: "auth-system".to_string(),
            worktree_path: PathBuf::from("/path/to/worktree"),
            status: OrchestrationStatus::Executing,
            current_phase: 2,
            total_phases: 4,
            elapsed_mins: 45,
        };

        assert_eq!(summary.feature, "auth-system");
        assert_eq!(summary.worktree_path, PathBuf::from("/path/to/worktree"));
        assert_eq!(summary.status, OrchestrationStatus::Executing);
        assert_eq!(summary.current_phase, 2);
        assert_eq!(summary.total_phases, 4);
        assert_eq!(summary.elapsed_mins, 45);
    }
}
