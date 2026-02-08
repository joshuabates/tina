use std::collections::HashMap;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{Result, SessionError};

// ====================================================================
// Session Lookup
// ====================================================================

/// Session lookup from ~/.claude/tina-sessions/{feature}.json
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionLookup {
    pub feature: String,
    pub worktree_path: PathBuf,
    pub repo_root: PathBuf,
    pub created_at: DateTime<Utc>,
    /// Convex orchestration doc ID (populated after init writes to Convex)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orchestration_id: Option<String>,
}

// ====================================================================
// Team Types
// ====================================================================

/// A team configuration from ~/.claude/teams/{name}/config.json
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Team {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "leadAgentId")]
    pub lead_agent_id: String,
    #[serde(rename = "leadSessionId")]
    pub lead_session_id: String,
    pub members: Vec<Agent>,
}

/// An agent in a team
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

// ====================================================================
// Task Types
// ====================================================================

/// A task in the task system from ~/.claude/tasks/{team}/
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::InProgress => write!(f, "in_progress"),
            TaskStatus::Completed => write!(f, "completed"),
        }
    }
}

// ====================================================================
// Context Metrics
// ====================================================================

/// Context metrics from statusline
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ContextMetrics {
    pub used_pct: u8,
    pub tokens: u64,
    pub max: u64,
    pub timestamp: DateTime<Utc>,
}

/// Overall orchestration status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestrationStatus {
    Planning,
    Executing,
    Reviewing,
    Complete,
    Blocked,
}

/// Phase status.
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

impl std::fmt::Display for PhaseStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PhaseStatus::Planning => write!(f, "planning"),
            PhaseStatus::Planned => write!(f, "planned"),
            PhaseStatus::Executing => write!(f, "executing"),
            PhaseStatus::Reviewing => write!(f, "reviewing"),
            PhaseStatus::Complete => write!(f, "complete"),
            PhaseStatus::Blocked => write!(f, "blocked"),
        }
    }
}

impl std::str::FromStr for PhaseStatus {
    type Err = SessionError;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "planning" => Ok(PhaseStatus::Planning),
            "planned" => Ok(PhaseStatus::Planned),
            "executing" => Ok(PhaseStatus::Executing),
            "reviewing" => Ok(PhaseStatus::Reviewing),
            "complete" => Ok(PhaseStatus::Complete),
            "blocked" => Ok(PhaseStatus::Blocked),
            _ => Err(SessionError::InvalidStatus(s.to_string())),
        }
    }
}

/// Timing breakdown for a phase.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PhaseBreakdown {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub planning_mins: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_mins: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_mins: Option<i64>,
}

/// State of a single phase.
#[derive(Debug, Clone, Serialize, Deserialize)]
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

    /// Collected review verdicts for consensus mode.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub review_verdicts: Vec<ReviewVerdict>,
}

impl PhaseState {
    /// Create a new phase state starting in planning.
    pub fn new() -> Self {
        Self {
            plan_path: None,
            status: PhaseStatus::Planning,
            planning_started_at: Some(Utc::now()),
            execution_started_at: None,
            review_started_at: None,
            completed_at: None,
            duration_mins: None,
            git_range: None,
            blocked_reason: None,
            breakdown: PhaseBreakdown::default(),
            review_verdicts: Vec::new(),
        }
    }
}

impl Default for PhaseState {
    fn default() -> Self {
        Self::new()
    }
}

/// Gap between phases for timing analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingGap {
    pub after: String,
    pub before: String,
    pub duration_mins: i64,
    pub timestamp: DateTime<Utc>,
}

/// Overall timing statistics.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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

/// Model routing policy for orchestration agents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPolicy {
    /// Model for the design validator agent. Default: "opus".
    #[serde(default = "default_opus")]
    pub validator: String,

    /// Model for phase planner agents. Default: "opus".
    #[serde(default = "default_opus")]
    pub planner: String,

    /// Model for phase executor agents. Default: "haiku".
    #[serde(default = "default_haiku")]
    pub executor: String,

    /// Model for phase reviewer agents. Default: "opus".
    #[serde(default = "default_opus")]
    pub reviewer: String,

    /// If true, design validation uses dual-model consensus (validator runs twice
    /// with different models and results must agree). Default: false.
    #[serde(default)]
    pub dual_validation: bool,

    /// If true, phase reviews require consensus from a second model before
    /// marking review as pass. Default: false.
    #[serde(default)]
    pub review_consensus: bool,
}

fn default_opus() -> String {
    "opus".to_string()
}

fn default_haiku() -> String {
    "haiku".to_string()
}

impl Default for ModelPolicy {
    fn default() -> Self {
        Self {
            validator: default_opus(),
            planner: default_opus(),
            executor: default_haiku(),
            reviewer: default_opus(),
            dual_validation: false,
            review_consensus: false,
        }
    }
}

/// A single review verdict for consensus tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewVerdict {
    pub result: String, // "pass" or "gaps"
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub issues: Vec<String>,
}

/// The main supervisor state record.
#[derive(Debug, Clone, Serialize, Deserialize)]
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

    #[serde(default)]
    pub model_policy: ModelPolicy,
}

impl SupervisorState {
    /// Create a new supervisor state.
    pub fn new(
        feature: &str,
        design_doc: PathBuf,
        worktree_path: PathBuf,
        branch: &str,
        total_phases: u32,
    ) -> Self {
        Self {
            version: 1,
            feature: feature.to_string(),
            design_doc,
            worktree_path,
            branch: branch.to_string(),
            total_phases,
            current_phase: 1,
            status: OrchestrationStatus::Planning,
            orchestration_started_at: Utc::now(),
            phases: HashMap::new(),
            timing: TimingStats::default(),
            model_policy: ModelPolicy::default(),
        }
    }

    /// Load supervisor state from Convex by feature name.
    pub fn load(feature: &str) -> Result<Self> {
        let feature_name = feature.to_string();
        let state_json = crate::convex::run_convex(|mut writer| async move {
            writer.get_supervisor_state(&feature_name).await
        })
        .map_err(|e| SessionError::ConvexError(e.to_string()))?;

        let json = match state_json {
            Some(json) => json,
            None => return Err(SessionError::NotInitialized(feature.to_string())),
        };

        let state: Self =
            serde_json::from_str(&json).map_err(|e| SessionError::ConvexError(e.to_string()))?;
        Ok(state)
    }

    /// Save supervisor state to Convex.
    pub fn save(&self) -> Result<()> {
        let feature_name = self.feature.clone();
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| SessionError::ConvexError(e.to_string()))?;
        let updated_at = chrono::Utc::now().timestamp_millis() as f64;

        crate::convex::run_convex(|mut writer| async move {
            writer
                .upsert_supervisor_state(&feature_name, &json, updated_at)
                .await?;
            Ok(())
        })
        .map_err(|e| SessionError::ConvexError(e.to_string()))?;

        Ok(())
    }

    /// Get or create phase state for a phase number.
    pub fn get_or_create_phase(&mut self, phase: u32) -> Result<&mut PhaseState> {
        if phase > self.total_phases {
            return Err(SessionError::PhaseNotFound(phase, self.total_phases));
        }
        let key = phase.to_string();
        if !self.phases.contains_key(&key) {
            self.phases.insert(key.clone(), PhaseState::new());
        }
        Ok(self.phases.get_mut(&key).unwrap())
    }

    /// Get phase state for a phase number.
    pub fn get_phase(&self, phase: u32) -> Result<&PhaseState> {
        if phase > self.total_phases {
            return Err(SessionError::PhaseNotFound(phase, self.total_phases));
        }
        let key = phase.to_string();
        self.phases
            .get(&key)
            .ok_or(SessionError::PhaseNotFound(phase, self.total_phases))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_phase_status_from_str() {
        assert_eq!("planning".parse::<PhaseStatus>().unwrap(), PhaseStatus::Planning);
        assert_eq!("executing".parse::<PhaseStatus>().unwrap(), PhaseStatus::Executing);
        assert_eq!("complete".parse::<PhaseStatus>().unwrap(), PhaseStatus::Complete);
        assert!("invalid".parse::<PhaseStatus>().is_err());
    }

    #[test]
    fn test_supervisor_state_new() {
        let state = SupervisorState::new(
            "auth",
            PathBuf::from("/docs/design.md"),
            PathBuf::from("/worktree"),
            "tina/auth",
            3,
        );
        assert_eq!(state.feature, "auth");
        assert_eq!(state.total_phases, 3);
        assert_eq!(state.current_phase, 1);
        assert_eq!(state.status, OrchestrationStatus::Planning);
    }

    // ====================================================================
    // SessionLookup Tests
    // ====================================================================

    #[test]
    fn test_session_lookup_serializes() {
        let lookup = SessionLookup {
            feature: "test-feature".to_string(),
            worktree_path: PathBuf::from("/path/to/worktree"),
            repo_root: PathBuf::from("/path/to/repo"),
            created_at: Utc::now(),
            orchestration_id: None,
        };

        let json = serde_json::to_string(&lookup).expect("serialize");
        let deserialized: SessionLookup = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, lookup);

        // New serialization uses worktree_path, not cwd
        assert!(json.contains("worktree_path"));
        assert!(json.contains("repo_root"));
        assert!(!json.contains("\"cwd\""));
    }

    // ====================================================================
    // Team Tests
    // ====================================================================

    #[test]
    fn test_team_serializes() {
        let team = Team {
            name: "test-team".to_string(),
            description: Some("A test team".to_string()),
            created_at: 1706644800000,
            lead_agent_id: "leader@test-team".to_string(),
            lead_session_id: "session-123".to_string(),
            members: vec![],
        };

        let json = serde_json::to_string(&team).expect("serialize");
        let deserialized: Team = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, team);
    }

    #[test]
    fn test_team_deserializes_from_claude_code_format() {
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

        let team: Team = serde_json::from_str(json).expect("deserialize");
        assert_eq!(team.name, "test-team");
        assert_eq!(team.lead_agent_id, "leader@test-team");
        assert_eq!(team.members.len(), 1);
        assert_eq!(team.members[0].name, "leader");
    }

    // ====================================================================
    // Agent Tests
    // ====================================================================

    #[test]
    fn test_agent_serializes() {
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

        let json = serde_json::to_string(&agent).expect("serialize");
        let deserialized: Agent = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, agent);
    }

    // ====================================================================
    // Task Tests
    // ====================================================================

    #[test]
    fn test_task_serializes() {
        let task = Task {
            id: "1".to_string(),
            subject: "Test task".to_string(),
            description: "A test task".to_string(),
            active_form: None,
            status: TaskStatus::Pending,
            owner: None,
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        };

        let json = serde_json::to_string(&task).expect("serialize");
        let deserialized: Task = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, task);
    }

    #[test]
    fn test_task_deserializes_from_claude_code_format() {
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

        let task: Task = serde_json::from_str(json).expect("deserialize");
        assert_eq!(task.id, "1");
        assert_eq!(task.status, TaskStatus::InProgress);
        assert_eq!(task.blocked_by, vec!["0"]);
        assert_eq!(task.active_form, Some("Testing".to_string()));
    }

    #[test]
    fn test_task_status_serializes() {
        assert_eq!(serde_json::to_string(&TaskStatus::Pending).unwrap(), "\"pending\"");
        assert_eq!(serde_json::to_string(&TaskStatus::InProgress).unwrap(), "\"in_progress\"");
        assert_eq!(serde_json::to_string(&TaskStatus::Completed).unwrap(), "\"completed\"");
    }

    #[test]
    fn test_task_status_display() {
        assert_eq!(TaskStatus::Pending.to_string(), "pending");
        assert_eq!(TaskStatus::InProgress.to_string(), "in_progress");
        assert_eq!(TaskStatus::Completed.to_string(), "completed");
    }

    // ====================================================================
    // ContextMetrics Tests
    // ====================================================================

    #[test]
    fn test_model_policy_default() {
        let policy = ModelPolicy::default();
        assert_eq!(policy.validator, "opus");
        assert_eq!(policy.planner, "opus");
        assert_eq!(policy.executor, "haiku");
        assert_eq!(policy.reviewer, "opus");
        assert!(!policy.dual_validation);
        assert!(!policy.review_consensus);
    }

    #[test]
    fn test_model_policy_deserializes_with_defaults() {
        let json = r#"{}"#;
        let policy: ModelPolicy = serde_json::from_str(json).unwrap();
        assert_eq!(policy.validator, "opus");
        assert_eq!(policy.executor, "haiku");
        assert!(!policy.dual_validation);
    }

    #[test]
    fn test_supervisor_state_with_model_policy() {
        let state = SupervisorState::new(
            "test",
            PathBuf::from("/docs/design.md"),
            PathBuf::from("/worktree"),
            "tina/test",
            2,
        );
        assert_eq!(state.model_policy.validator, "opus");
        assert_eq!(state.model_policy.executor, "haiku");
    }

    #[test]
    fn test_context_metrics_serializes() {
        let metrics = ContextMetrics {
            used_pct: 42,
            tokens: 50000,
            max: 120000,
            timestamp: Utc::now(),
        };

        let json = serde_json::to_string(&metrics).expect("serialize");
        let deserialized: ContextMetrics = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized, metrics);
    }
}
