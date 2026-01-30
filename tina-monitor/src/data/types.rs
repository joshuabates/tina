//! Core data types for tina-monitor

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// A team configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64, // Unix timestamp ms
    #[serde(rename = "leadAgentId")]
    pub lead_agent_id: String,
    #[serde(rename = "leadSessionId")]
    pub lead_session_id: String,
    pub members: Vec<Agent>,
}

/// An agent in a team
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    #[serde(rename = "agentId")]
    pub agent_id: String,
    pub name: String,
    #[serde(rename = "agentType")]
    pub agent_type: Option<String>,
    pub model: String,
    #[serde(rename = "joinedAt")]
    pub joined_at: i64,
    #[serde(rename = "tmuxPaneId")]
    pub tmux_pane_id: Option<String>,
    pub cwd: PathBuf,
    #[serde(default)]
    pub subscriptions: Vec<String>,
}

/// A task in the task system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub subject: String,
    pub description: String,
    #[serde(rename = "activeForm")]
    pub active_form: Option<String>,
    pub status: TaskStatus,
    pub owner: Option<String>,
    #[serde(default)]
    pub blocks: Vec<String>,
    #[serde(default, rename = "blockedBy")]
    pub blocked_by: Vec<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

/// Task status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
}

/// Supervisor state for an orchestration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupervisorState {
    pub design_doc_path: PathBuf,
    pub worktree_path: PathBuf,
    pub branch_name: String,
    pub total_phases: u32,
    pub current_phase: u32,
    #[serde(default)]
    pub plan_paths: HashMap<u32, PathBuf>,
    pub status: String,
}

/// Context metrics from statusline
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMetrics {
    pub used_pct: u8,
    pub tokens: u64,
    pub max: u64,
    pub timestamp: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_team() {
        let json = r#"{
            "name": "test-team",
            "description": "A test team",
            "createdAt": 1706644800000,
            "leadAgentId": "leader@test-team",
            "leadSessionId": "session-123",
            "members": [{
                "agentId": "leader@test-team",
                "name": "leader",
                "agentType": "team-lead",
                "model": "claude-opus-4-5-20251101",
                "joinedAt": 1706644800000,
                "tmuxPaneId": null,
                "cwd": "/path/to/project",
                "subscriptions": []
            }]
        }"#;

        let team: Team = serde_json::from_str(json).expect("Should parse team");
        assert_eq!(team.name, "test-team");
        assert_eq!(team.description, Some("A test team".to_string()));
        assert_eq!(team.members.len(), 1);
        assert_eq!(team.members[0].name, "leader");
    }

    #[test]
    fn test_deserialize_task() {
        let json = r#"{
            "id": "1",
            "subject": "Test task",
            "description": "A test task description",
            "activeForm": "Testing",
            "status": "in_progress",
            "owner": "worker",
            "blocks": [],
            "blockedBy": ["0"],
            "metadata": {}
        }"#;

        let task: Task = serde_json::from_str(json).expect("Should parse task");
        assert_eq!(task.id, "1");
        assert_eq!(task.status, TaskStatus::InProgress);
        assert_eq!(task.blocked_by, vec!["0"]);
    }

    #[test]
    fn test_deserialize_task_status_variants() {
        assert_eq!(
            serde_json::from_str::<TaskStatus>("\"pending\"").unwrap(),
            TaskStatus::Pending
        );
        assert_eq!(
            serde_json::from_str::<TaskStatus>("\"in_progress\"").unwrap(),
            TaskStatus::InProgress
        );
        assert_eq!(
            serde_json::from_str::<TaskStatus>("\"completed\"").unwrap(),
            TaskStatus::Completed
        );
    }

    #[test]
    fn test_deserialize_supervisor_state() {
        let json = r#"{
            "design_doc_path": "docs/plans/design.md",
            "worktree_path": "/path/to/worktree",
            "branch_name": "feature/test",
            "total_phases": 3,
            "current_phase": 1,
            "plan_paths": {},
            "status": "executing"
        }"#;

        let state: SupervisorState =
            serde_json::from_str(json).expect("Should parse supervisor state");
        assert_eq!(state.total_phases, 3);
        assert_eq!(state.current_phase, 1);
        assert_eq!(state.status, "executing");
    }

    #[test]
    fn test_deserialize_context_metrics() {
        let json = r#"{
            "used_pct": 42,
            "tokens": 50000,
            "max": 120000,
            "timestamp": "2026-01-30T10:00:00Z"
        }"#;

        let metrics: ContextMetrics =
            serde_json::from_str(json).expect("Should parse context metrics");
        assert_eq!(metrics.used_pct, 42);
        assert_eq!(metrics.tokens, 50000);
    }
}
