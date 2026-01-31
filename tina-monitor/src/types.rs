//! Type definitions for tina-monitor
//!
//! Aligns with tina-session schema for orchestration state management.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

// ====================================================================
// Enums
// ====================================================================

/// Status of an orchestration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestrationStatus {
    Planning,
    Executing,
    Reviewing,
    Complete,
    Blocked,
}

/// Status of a phase
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhaseStatus {
    Planning,
    Planned,
    Executing,
    Reviewing,
    Complete,
    Blocked,
}

/// Status of a task
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
}

// ====================================================================
// Data Structures
// ====================================================================

/// Session lookup from ~/.claude/tina-sessions/{feature}.json
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionLookup {
    pub feature: String,
    pub session_id: String,
}

/// Timing breakdown for a phase.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct PhaseBreakdown {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub planning_mins: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_mins: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_mins: Option<i64>,
}

/// Gap between phases for timing analysis.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TimingGap {
    pub after: String,
    pub before: String,
    pub duration_mins: i64,
    pub timestamp: DateTime<Utc>,
}

/// Overall timing statistics.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct TimingStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_elapsed_mins: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_mins: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_mins: Option<i64>,
    #[serde(default)]
    pub gaps: Vec<TimingGap>,
}

/// State of a single phase
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PhaseState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan_path: Option<PathBuf>,

    pub status: PhaseStatus,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub planning_started_at: Option<DateTime<Utc>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_started_at: Option<DateTime<Utc>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_started_at: Option<DateTime<Utc>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_mins: Option<i64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_range: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_reason: Option<String>,

    #[serde(default)]
    pub breakdown: PhaseBreakdown,
}

/// State of the supervisor/orchestration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SupervisorState {
    pub version: u32,
    pub feature: String,
    pub design_doc: PathBuf,
    pub worktree_path: PathBuf,
    pub branch: String,
    pub total_phases: u32,
    pub current_phase: u32,
    pub status: OrchestrationStatus,
    pub orchestration_started_at: DateTime<Utc>,
    #[serde(default)]
    pub phases: HashMap<String, PhaseState>,
    #[serde(default)]
    pub timing: TimingStats,
}

/// Team member information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TeamMember {
    pub agent_id: String,
    pub name: String,
    pub agent_type: String,
    pub model: String,
    pub tmux_pane_id: Option<String>,
    pub cwd: PathBuf,
}

/// Team information
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Team {
    pub name: String,
    pub description: Option<String>,
    pub lead_agent_id: String,
    pub members: Vec<TeamMember>,
}

/// Task in the task list
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Task {
    pub id: String,
    pub subject: String,
    pub description: String,
    pub status: TaskStatus,
    pub owner: Option<String>,
    pub blocks: Vec<String>,
    pub blocked_by: Vec<String>,
}

/// Summary of an orchestration for display in finder
#[derive(Debug, Clone)]
pub struct OrchestrationSummary {
    pub feature: String,
    pub worktree_path: PathBuf,
    pub status: OrchestrationStatus,
    pub current_phase: u32,
    pub total_phases: u32,
    pub elapsed_mins: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ====================================================================
    // SessionLookup Tests
    // ====================================================================

    #[test]
    fn session_lookup_serializes_and_deserializes() {
        let original = SessionLookup {
            feature: "feature-x".to_string(),
            session_id: "session-123".to_string(),
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: SessionLookup =
            serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    // ====================================================================
    // OrchestrationStatus Tests
    // ====================================================================

    #[test]
    fn orchestration_status_planning_serializes() {
        let status = OrchestrationStatus::Planning;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: OrchestrationStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn orchestration_status_executing_serializes() {
        let status = OrchestrationStatus::Executing;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: OrchestrationStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn orchestration_status_reviewing_serializes() {
        let status = OrchestrationStatus::Reviewing;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: OrchestrationStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn orchestration_status_complete_serializes() {
        let status = OrchestrationStatus::Complete;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: OrchestrationStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn orchestration_status_blocked_serializes() {
        let status = OrchestrationStatus::Blocked;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: OrchestrationStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    // ====================================================================
    // PhaseStatus Tests
    // ====================================================================

    #[test]
    fn phase_status_planning_serializes() {
        let status = PhaseStatus::Planning;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: PhaseStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn phase_status_planned_serializes() {
        let status = PhaseStatus::Planned;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: PhaseStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn phase_status_executing_serializes() {
        let status = PhaseStatus::Executing;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: PhaseStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn phase_status_reviewing_serializes() {
        let status = PhaseStatus::Reviewing;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: PhaseStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn phase_status_complete_serializes() {
        let status = PhaseStatus::Complete;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: PhaseStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn phase_status_blocked_serializes() {
        let status = PhaseStatus::Blocked;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: PhaseStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    // ====================================================================
    // TaskStatus Tests
    // ====================================================================

    #[test]
    fn task_status_pending_serializes() {
        let status = TaskStatus::Pending;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: TaskStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn task_status_in_progress_serializes() {
        let status = TaskStatus::InProgress;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: TaskStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    #[test]
    fn task_status_completed_serializes() {
        let status = TaskStatus::Completed;
        let json = serde_json::to_string(&status).expect("serialize");
        let deserialized: TaskStatus =
            serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, status);
    }

    // ====================================================================
    // PhaseState Tests
    // ====================================================================

    #[test]
    fn phase_state_serializes_and_deserializes() {
        let now = Utc::now();
        let original = PhaseState {
            plan_path: Some(PathBuf::from("/path/to/plan.md")),
            status: PhaseStatus::Executing,
            planning_started_at: None,
            execution_started_at: Some(now),
            review_started_at: None,
            completed_at: None,
            duration_mins: Some(30),
            git_range: Some("abc123..def456".to_string()),
            blocked_reason: None,
            breakdown: PhaseBreakdown::default(),
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: PhaseState =
            serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    #[test]
    fn phase_state_with_no_timestamps_serializes() {
        let original = PhaseState {
            plan_path: Some(PathBuf::from("/path/to/plan.md")),
            status: PhaseStatus::Planning,
            planning_started_at: None,
            execution_started_at: None,
            review_started_at: None,
            completed_at: None,
            duration_mins: None,
            git_range: None,
            blocked_reason: None,
            breakdown: PhaseBreakdown::default(),
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: PhaseState =
            serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    // ====================================================================
    // SupervisorState Tests
    // ====================================================================

    #[test]
    fn supervisor_state_serializes_and_deserializes() {
        let now = Utc::now();
        let mut phases = HashMap::new();
        phases.insert(
            "1".to_string(),
            PhaseState {
                plan_path: Some(PathBuf::from("/path/to/plan.md")),
                status: PhaseStatus::Complete,
                planning_started_at: None,
                execution_started_at: Some(now),
                review_started_at: None,
                completed_at: Some(now),
                duration_mins: Some(60),
                git_range: Some("abc123..def456".to_string()),
                blocked_reason: None,
                breakdown: PhaseBreakdown::default(),
            },
        );

        let original = SupervisorState {
            version: 1,
            feature: "feature-x".to_string(),
            design_doc: PathBuf::from("/path/to/design.md"),
            worktree_path: PathBuf::from("/path/to/worktree"),
            branch: "feature-x".to_string(),
            total_phases: 3,
            current_phase: 2,
            status: OrchestrationStatus::Executing,
            orchestration_started_at: now,
            phases,
            timing: TimingStats::default(),
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: SupervisorState =
            serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    #[test]
    fn supervisor_state_with_multiple_phases_serializes() {
        let now = Utc::now();
        let mut phases = HashMap::new();
        phases.insert(
            "1".to_string(),
            PhaseState {
                plan_path: Some(PathBuf::from("/path/to/plan1.md")),
                status: PhaseStatus::Complete,
                planning_started_at: None,
                execution_started_at: Some(now),
                review_started_at: None,
                completed_at: Some(now),
                duration_mins: Some(60),
                git_range: Some("abc123..def456".to_string()),
                blocked_reason: None,
                breakdown: PhaseBreakdown::default(),
            },
        );
        phases.insert(
            "2".to_string(),
            PhaseState {
                plan_path: Some(PathBuf::from("/path/to/plan2.md")),
                status: PhaseStatus::Executing,
                planning_started_at: None,
                execution_started_at: Some(now),
                review_started_at: None,
                completed_at: None,
                duration_mins: Some(30),
                git_range: None,
                blocked_reason: None,
                breakdown: PhaseBreakdown::default(),
            },
        );

        let original = SupervisorState {
            version: 1,
            feature: "feature-x".to_string(),
            design_doc: PathBuf::from("/path/to/design.md"),
            worktree_path: PathBuf::from("/path/to/worktree"),
            branch: "feature-x".to_string(),
            total_phases: 3,
            current_phase: 2,
            status: OrchestrationStatus::Executing,
            orchestration_started_at: now,
            phases,
            timing: TimingStats::default(),
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: SupervisorState =
            serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    // ====================================================================
    // TeamMember Tests
    // ====================================================================

    #[test]
    fn team_member_serializes_and_deserializes() {
        let original = TeamMember {
            agent_id: "agent-1".to_string(),
            name: "researcher".to_string(),
            agent_type: "general-purpose".to_string(),
            model: "claude-opus".to_string(),
            tmux_pane_id: Some("0".to_string()),
            cwd: PathBuf::from("/path/to/work"),
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: TeamMember =
            serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    #[test]
    fn team_member_with_no_pane_id_serializes() {
        let original = TeamMember {
            agent_id: "agent-2".to_string(),
            name: "tester".to_string(),
            agent_type: "test-runner".to_string(),
            model: "claude-haiku".to_string(),
            tmux_pane_id: None,
            cwd: PathBuf::from("/path/to/work"),
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: TeamMember =
            serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    // ====================================================================
    // Team Tests
    // ====================================================================

    #[test]
    fn team_serializes_and_deserializes() {
        let member = TeamMember {
            agent_id: "agent-1".to_string(),
            name: "researcher".to_string(),
            agent_type: "general-purpose".to_string(),
            model: "claude-opus".to_string(),
            tmux_pane_id: Some("0".to_string()),
            cwd: PathBuf::from("/path/to/work"),
        };

        let original = Team {
            name: "project-x".to_string(),
            description: Some("Build feature X".to_string()),
            lead_agent_id: "team-lead".to_string(),
            members: vec![member],
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: Team = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    #[test]
    fn team_with_multiple_members_serializes() {
        let members = vec![
            TeamMember {
                agent_id: "agent-1".to_string(),
                name: "researcher".to_string(),
                agent_type: "general-purpose".to_string(),
                model: "claude-opus".to_string(),
                tmux_pane_id: Some("0".to_string()),
                cwd: PathBuf::from("/path/to/work"),
            },
            TeamMember {
                agent_id: "agent-2".to_string(),
                name: "tester".to_string(),
                agent_type: "test-runner".to_string(),
                model: "claude-haiku".to_string(),
                tmux_pane_id: Some("1".to_string()),
                cwd: PathBuf::from("/path/to/work"),
            },
        ];

        let original = Team {
            name: "project-x".to_string(),
            description: None,
            lead_agent_id: "team-lead".to_string(),
            members,
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: Team = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    // ====================================================================
    // Task Tests
    // ====================================================================

    #[test]
    fn task_serializes_and_deserializes() {
        let original = Task {
            id: "task-1".to_string(),
            subject: "Implement feature X".to_string(),
            description: "Add feature X to the system".to_string(),
            status: TaskStatus::InProgress,
            owner: Some("researcher".to_string()),
            blocks: vec!["task-2".to_string()],
            blocked_by: vec![],
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: Task = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    #[test]
    fn task_with_no_owner_serializes() {
        let original = Task {
            id: "task-3".to_string(),
            subject: "Review code".to_string(),
            description: "Review the feature implementation".to_string(),
            status: TaskStatus::Pending,
            owner: None,
            blocks: vec![],
            blocked_by: vec!["task-1".to_string()],
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: Task = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
    }

    #[test]
    fn task_with_multiple_dependencies_serializes() {
        let original = Task {
            id: "task-4".to_string(),
            subject: "Merge code".to_string(),
            description: "Merge all completed features".to_string(),
            status: TaskStatus::Pending,
            owner: None,
            blocks: vec![],
            blocked_by: vec!["task-1".to_string(), "task-2".to_string()],
        };

        let json = serde_json::to_string(&original).expect("serialize");
        let deserialized: Task = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(deserialized, original);
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
