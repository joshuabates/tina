//! Data modules for tina-monitor

pub mod discovery;
pub mod tasks;
pub mod teams;
pub mod tina_state;
pub mod types;
pub mod watcher;

use std::path::{Path, PathBuf};
use std::fs;
use anyhow::{Result, Context};
use chrono::Utc;
use crate::types::*;

/// Convert a feature name to its worktree .claude/tina directory path
fn lookup_to_worktree_path(feature: &str) -> PathBuf {
    let home = dirs::home_dir().expect("Could not determine home directory");
    home.join(".claude")
        .join("worktrees")
        .join(format!("tina-{}", feature))
        .join(".claude")
        .join("tina")
}

/// Full orchestration data (loaded on demand)
#[derive(Debug, Clone)]
pub struct Orchestration {
    pub state: SupervisorState,
    pub orchestrator_team: Option<Team>,
    pub phase_team: Option<Team>,
    pub tasks: Vec<Task>,
}

/// Data source for reading from tina-session files or fixtures
pub struct DataSource {
    /// If set, read from this fixture directory instead of live data
    fixture_path: Option<PathBuf>,
    /// Currently loaded orchestration
    current: Option<Orchestration>,
}

impl DataSource {
    /// Create a new data source, optionally loading from fixtures
    pub fn new(fixture_path: Option<PathBuf>) -> Self {
        DataSource {
            fixture_path,
            current: None,
        }
    }

    /// Get currently loaded orchestration
    pub fn current(&self) -> Option<&Orchestration> {
        self.current.as_ref()
    }

    /// List all available orchestrations
    pub fn list_orchestrations(&self) -> Result<Vec<OrchestrationSummary>> {
        let sessions_dir = self.sessions_dir();

        if !sessions_dir.exists() {
            return Ok(vec![]);
        }

        let mut summaries = Vec::new();

        for entry in fs::read_dir(&sessions_dir)
            .context(format!("Failed to list sessions directory: {}", sessions_dir.display()))?
        {
            let entry = entry.context("Failed to read directory entry")?;
            let path = entry.path();

            // Only process .json files
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            // Extract feature name from filename
            let feature = path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();

            // Try to load the session lookup to find the worktree path
            if let Ok(_lookup) = self.load_session_lookup(&feature) {
                // Try to find the supervisor state in the worktree
                let tina_dir = lookup_to_worktree_path(&feature);
                if let Ok(summary) = self.load_summary(&tina_dir) {
                    summaries.push(summary);
                }
            }
        }

        Ok(summaries)
    }

    /// Load full orchestration data for a feature
    pub fn load_orchestration(&mut self, feature: &str) -> Result<&Orchestration> {
        // Load session lookup to find worktree location
        let _lookup = self.load_session_lookup(feature)?;

        // Load supervisor state (status.json)
        let tina_dir = lookup_to_worktree_path(feature);
        let state = self.load_supervisor_state(&tina_dir)?;

        // Load orchestrator team if available
        let orchestrator_team = self.load_team(&format!("{}-orchestrator", feature)).ok();

        // Load phase team if available
        let phase_team = self.load_team(&format!("{}-phase", feature)).ok();

        // Load tasks for the feature team
        let tasks = self.load_tasks(feature).unwrap_or_default();

        // Store the loaded orchestration
        self.current = Some(Orchestration {
            state,
            orchestrator_team,
            phase_team,
            tasks,
        });

        self.current.as_ref().ok_or_else(|| {
            anyhow::anyhow!("Failed to load orchestration for feature: {}", feature)
        })
    }

    /// Get path to sessions directory (~/.claude/tina-sessions or fixture path)
    pub fn sessions_dir(&self) -> PathBuf {
        match &self.fixture_path {
            Some(fixture) => fixture.clone(),
            None => {
                let home = dirs::home_dir().expect("Could not determine home directory");
                home.join(".claude").join("tina-sessions")
            }
        }
    }

    /// Get path to teams directory (~/.claude/teams or fixture/.claude/teams)
    pub fn teams_dir(&self) -> PathBuf {
        match &self.fixture_path {
            Some(fixture) => fixture.join(".claude").join("teams"),
            None => {
                let home = dirs::home_dir().expect("Could not determine home directory");
                home.join(".claude").join("teams")
            }
        }
    }

    /// Get path to tasks directory (~/.claude/tasks or fixture/.claude/tasks)
    pub fn tasks_dir(&self) -> PathBuf {
        match &self.fixture_path {
            Some(fixture) => fixture.join(".claude").join("tasks"),
            None => {
                let home = dirs::home_dir().expect("Could not determine home directory");
                home.join(".claude").join("tasks")
            }
        }
    }

    /// Load session lookup from ~/.claude/tina-sessions/{feature}.json
    pub fn load_session_lookup(&self, feature: &str) -> Result<SessionLookup> {
        let path = self.sessions_dir().join(format!("{}.json", feature));
        let content = fs::read_to_string(&path)
            .context(format!("Failed to read session lookup: {}", path.display()))?;
        serde_json::from_str(&content)
            .context("Failed to parse session lookup JSON")
    }

    /// Load supervisor state from worktree/.claude/tina/status.json
    pub fn load_supervisor_state(&self, worktree: &Path) -> Result<SupervisorState> {
        let path = worktree.join("status.json");
        let content = fs::read_to_string(&path)
            .context(format!("Failed to read supervisor state: {}", path.display()))?;
        serde_json::from_str(&content)
            .context("Failed to parse supervisor state JSON")
    }

    /// Load team from ~/.claude/teams/{name}.json
    pub fn load_team(&self, name: &str) -> Result<Team> {
        let path = self.teams_dir().join(format!("{}.json", name));
        let content = fs::read_to_string(&path)
            .context(format!("Failed to read team: {}", path.display()))?;
        serde_json::from_str(&content)
            .context("Failed to parse team JSON")
    }

    /// Load tasks from ~/.claude/tasks/{team_name}/ directory, sorted by id numerically
    pub fn load_tasks(&self, team_name: &str) -> Result<Vec<Task>> {
        let dir = self.tasks_dir().join(team_name);

        // Return empty vec if directory doesn't exist
        if !dir.exists() {
            return Ok(vec![]);
        }

        let mut tasks = Vec::new();

        // Read all .json files in the directory
        for entry in fs::read_dir(&dir)
            .context(format!("Failed to read tasks directory: {}", dir.display()))?
        {
            let entry = entry.context("Failed to read directory entry")?;
            let path = entry.path();

            // Only process .json files
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            let content = fs::read_to_string(&path)
                .context(format!("Failed to read task file: {}", path.display()))?;
            let task: Task = serde_json::from_str(&content)
                .context(format!("Failed to parse task JSON: {}", path.display()))?;
            tasks.push(task);
        }

        // Sort tasks by id numerically
        tasks.sort_by(|a, b| {
            let a_num: Option<i64> = a.id.parse().ok();
            let b_num: Option<i64> = b.id.parse().ok();

            match (a_num, b_num) {
                (Some(a), Some(b)) => a.cmp(&b),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => a.id.cmp(&b.id),
            }
        });

        Ok(tasks)
    }

    /// Load orchestration summary from worktree/.claude/tina/status.json
    pub fn load_summary(&self, lookup_path: &PathBuf) -> Result<OrchestrationSummary> {
        let state = self.load_supervisor_state(lookup_path)?;

        // Calculate elapsed time in minutes
        let now = Utc::now();
        let elapsed_mins = (now - state.orchestration_started_at).num_minutes();

        Ok(OrchestrationSummary {
            feature: state.feature,
            worktree_path: state.worktree_path,
            status: state.status,
            current_phase: state.current_phase,
            total_phases: state.total_phases,
            elapsed_mins,
        })
    }
}
