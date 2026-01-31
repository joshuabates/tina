use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{Result, SessionError};

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

/// The main supervisor state file.
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
        }
    }

    /// Get the path to the supervisor state file for a worktree.
    pub fn state_path(worktree: &Path) -> PathBuf {
        worktree
            .join(".claude")
            .join("tina")
            .join("supervisor-state.json")
    }

    /// Load supervisor state from a worktree.
    pub fn load(worktree: &Path) -> Result<Self> {
        let path = Self::state_path(worktree);
        if !path.exists() {
            return Err(SessionError::FileNotFound(path.display().to_string()));
        }
        let contents = fs::read_to_string(&path)
            .map_err(|e| SessionError::FileNotFound(format!("{}: {}", path.display(), e)))?;
        let state: Self = serde_json::from_str(&contents)
            .map_err(|e| SessionError::FileNotFound(format!("Invalid JSON: {}", e)))?;
        Ok(state)
    }

    /// Save supervisor state to its worktree.
    pub fn save(&self) -> Result<()> {
        let path = Self::state_path(&self.worktree_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                SessionError::DirectoryNotFound(format!("{}: {}", parent.display(), e))
            })?;
        }
        let contents = serde_json::to_string_pretty(self)
            .map_err(|e| SessionError::FileNotFound(format!("Serialization error: {}", e)))?;
        fs::write(&path, contents)
            .map_err(|e| SessionError::FileNotFound(format!("{}: {}", path.display(), e)))?;
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
            .ok_or_else(|| SessionError::PhaseNotFound(phase, self.total_phases))
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

    #[test]
    fn test_state_path() {
        let path = SupervisorState::state_path(Path::new("/worktree"));
        assert_eq!(
            path,
            PathBuf::from("/worktree/.claude/tina/supervisor-state.json")
        );
    }
}
