//! Type definitions for tina-monitor
//!
//! Re-exports canonical types from tina-session and monitor-specific types.

// Re-export all schema types from tina-session
pub use tina_session::state::schema::{
    Agent, ContextMetrics, OrchestrationStatus, PhaseBreakdown, PhaseState, PhaseStatus,
    SupervisorState, Task, TaskStatus, Team, TimingGap, TimingStats,
};

// Re-export monitor-specific types
pub use crate::data::convex::{
    MonitorOrchestration, MonitorOrchestrationStatus, OrchestrationSummary,
};

/// TeamMember is a type alias for Agent for backward compatibility.
pub type TeamMember = Agent;

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

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
    // MonitorOrchestrationStatus Tests
    // ====================================================================

    #[test]
    fn monitor_status_display() {
        assert_eq!(MonitorOrchestrationStatus::Executing.to_string(), "executing");
        assert_eq!(MonitorOrchestrationStatus::Complete.to_string(), "complete");
    }
}
