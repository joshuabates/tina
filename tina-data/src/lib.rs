//! Shared data layer for Tina orchestration monitoring
//!
//! This crate provides data loading, discovery, and file watching
//! for orchestration state. Used by both tina-monitor (TUI) and
//! tina-web (web dashboard).

pub mod db;
pub mod discovery;
pub mod tasks;
pub mod teams;
pub mod tina_state;
pub mod watcher;

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;

// Re-export canonical types from tina-session for convenience
pub use tina_session::state::schema::{
    Agent, ContextMetrics, OrchestrationStatus, PhaseBreakdown, PhaseState, PhaseStatus,
    SessionLookup, SupervisorState, Task, TaskStatus, Team, TimingGap, TimingStats,
};

/// Summary of an orchestration for display in finder.
#[derive(Debug, Clone)]
pub struct OrchestrationSummary {
    pub feature: String,
    pub worktree_path: PathBuf,
    pub status: OrchestrationStatus,
    pub current_phase: u32,
    pub total_phases: u32,
    pub elapsed_mins: i64,
}

/// Full orchestration data (loaded on demand via DataSource)
#[derive(Debug, Clone)]
pub struct LoadedOrchestration {
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
    current: Option<LoadedOrchestration>,
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
    pub fn current(&self) -> Option<&LoadedOrchestration> {
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
            if let Ok(lookup) = self.load_session_lookup(&feature) {
                // Resolve cwd relative to fixture path if needed
                let worktree = self.resolve_path(&lookup.cwd);
                let tina_dir = worktree.join(".claude").join("tina");
                if let Ok(summary) = self.load_summary(&tina_dir) {
                    summaries.push(summary);
                }
            }
        }

        Ok(summaries)
    }

    /// Load full orchestration data for a feature
    pub fn load_orchestration(&mut self, feature: &str) -> Result<&LoadedOrchestration> {
        // Load session lookup to find worktree location
        let lookup = self.load_session_lookup(feature)?;

        // Use lookup.cwd directly (resolve relative paths for fixtures)
        let worktree = self.resolve_path(&lookup.cwd);
        let tina_dir = worktree.join(".claude").join("tina");
        let state = self.load_supervisor_state(&tina_dir)?;

        // Load orchestrator team if available
        let orchestrator_team = self.load_team(&format!("{}-orchestrator", feature)).ok();

        // Load phase team if available
        let phase_team = self.load_team(&format!("{}-phase", feature)).ok();

        // Load tasks for the feature team
        let tasks = self.load_tasks(feature).unwrap_or_default();

        // Store the loaded orchestration
        self.current = Some(LoadedOrchestration {
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

    /// Resolve a path, handling relative paths when using fixtures
    fn resolve_path(&self, path: &Path) -> PathBuf {
        match &self.fixture_path {
            Some(base) if path.is_relative() => base.join(path),
            _ => path.to_path_buf(),
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

    /// Load supervisor state from worktree/.claude/tina/supervisor-state.json
    pub fn load_supervisor_state(&self, tina_dir: &Path) -> Result<SupervisorState> {
        let path = tina_dir.join("supervisor-state.json");
        let content = fs::read_to_string(&path)
            .context(format!("Failed to read supervisor state: {}", path.display()))?;
        serde_json::from_str(&content)
            .context("Failed to parse supervisor state JSON")
    }

    /// Load team from ~/.claude/teams/{name}/config.json
    pub fn load_team(&self, name: &str) -> Result<Team> {
        let path = self.teams_dir().join(name).join("config.json");
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
    pub fn load_summary(&self, lookup_path: &Path) -> Result<OrchestrationSummary> {
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
