//! Local file-based data source for the panel-grid app shell.
//!
//! Reads session lookups, supervisor state, teams, and tasks from
//! the filesystem (or a fixture directory for testing).

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::types::{SessionLookup, SupervisorState, Task, Team};

/// Full orchestration data loaded from local files.
#[derive(Debug, Clone)]
pub struct LoadedOrchestration {
    pub state: SupervisorState,
    pub orchestrator_team: Option<Team>,
    pub phase_team: Option<Team>,
    pub tasks: Vec<Task>,
}

/// File-based data source for reading orchestration data from disk.
pub struct DataSource {
    fixture_path: Option<PathBuf>,
    current: Option<LoadedOrchestration>,
}

impl DataSource {
    /// Create a new data source, optionally reading from a fixture directory.
    pub fn new(fixture_path: Option<PathBuf>) -> Self {
        DataSource {
            fixture_path,
            current: None,
        }
    }

    /// List all available orchestrations (returns summaries for the fuzzy finder).
    pub fn list_orchestrations(&self) -> Result<Vec<crate::data::OrchestrationSummary>> {
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

            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }

            let feature = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();

            if let Ok(lookup) = self.load_session_lookup(&feature) {
                let worktree = self.resolve_path(&lookup.worktree_path);
                let tina_dir = worktree.join(".claude").join("tina");
                if let Ok(state) = load_supervisor_state(&tina_dir) {
                    summaries.push(crate::data::OrchestrationSummary {
                        feature: state.feature.clone(),
                        worktree_path: PathBuf::from(&state.worktree_path),
                        status: crate::data::MonitorOrchestrationStatus::from_orchestration_status(&state.status),
                        current_phase: state.current_phase,
                        total_phases: state.total_phases,
                        elapsed_mins: None,
                    });
                }
            }
        }

        Ok(summaries)
    }

    /// Load full orchestration data for a feature.
    pub fn load_orchestration(&mut self, feature: &str) -> Result<&LoadedOrchestration> {
        let lookup = self.load_session_lookup(feature)?;
        let worktree = self.resolve_path(&lookup.worktree_path);
        let tina_dir = worktree.join(".claude").join("tina");
        let state = load_supervisor_state(&tina_dir)?;

        let orchestrator_team = self.load_team(&format!("{}-orchestration", feature)).ok();

        let tasks = orchestrator_team
            .as_ref()
            .and_then(|team| self.load_tasks(&team.lead_session_id).ok())
            .unwrap_or_default();

        self.current = Some(LoadedOrchestration {
            state,
            orchestrator_team,
            phase_team: None,
            tasks,
        });

        self.current.as_ref().ok_or_else(|| {
            anyhow::anyhow!("Failed to load orchestration for feature: {}", feature)
        })
    }

    /// Get a reference to the currently loaded orchestration.
    pub fn current(&self) -> Option<&LoadedOrchestration> {
        self.current.as_ref()
    }

    pub fn sessions_dir(&self) -> PathBuf {
        match &self.fixture_path {
            Some(fixture) => fixture.clone(),
            None => {
                let home = dirs::home_dir().expect("Could not determine home directory");
                home.join(".claude").join("tina-sessions")
            }
        }
    }

    pub fn teams_dir(&self) -> PathBuf {
        match &self.fixture_path {
            Some(fixture) => fixture.join(".claude").join("teams"),
            None => {
                let home = dirs::home_dir().expect("Could not determine home directory");
                home.join(".claude").join("teams")
            }
        }
    }

    pub fn tasks_dir(&self) -> PathBuf {
        match &self.fixture_path {
            Some(fixture) => fixture.join(".claude").join("tasks"),
            None => {
                let home = dirs::home_dir().expect("Could not determine home directory");
                home.join(".claude").join("tasks")
            }
        }
    }

    fn resolve_path(&self, path: &Path) -> PathBuf {
        match &self.fixture_path {
            Some(base) if path.is_relative() => base.join(path),
            _ => path.to_path_buf(),
        }
    }

    pub fn load_session_lookup(&self, feature: &str) -> Result<SessionLookup> {
        let path = self.sessions_dir().join(format!("{}.json", feature));
        let content = fs::read_to_string(&path)
            .context(format!("Failed to read session lookup: {}", path.display()))?;
        serde_json::from_str(&content).context("Failed to parse session lookup JSON")
    }

    pub fn load_team(&self, name: &str) -> Result<Team> {
        let path = self.teams_dir().join(name).join("config.json");
        let content = fs::read_to_string(&path)
            .context(format!("Failed to read team: {}", path.display()))?;
        serde_json::from_str(&content).context("Failed to parse team JSON")
    }

    pub fn load_tasks(&self, team_name: &str) -> Result<Vec<Task>> {
        let dir = self.tasks_dir().join(team_name);
        if !dir.exists() {
            return Ok(vec![]);
        }

        let mut tasks = Vec::new();
        for entry in fs::read_dir(&dir)
            .context(format!("Failed to read tasks directory: {}", dir.display()))?
        {
            let entry = entry.context("Failed to read directory entry")?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let content = fs::read_to_string(&path)
                .context(format!("Failed to read task file: {}", path.display()))?;
            let task: Task = serde_json::from_str(&content)
                .context(format!("Failed to parse task JSON: {}", path.display()))?;
            tasks.push(task);
        }

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
    /// Load supervisor state from a tina directory.
    pub fn load_supervisor_state(&self, tina_dir: &Path) -> Result<SupervisorState> {
        load_supervisor_state(tina_dir)
    }

    /// Load an orchestration summary from a tina directory.
    pub fn load_summary(&self, tina_dir: &Path) -> Result<crate::data::OrchestrationSummary> {
        let state = load_supervisor_state(tina_dir)?;
        Ok(crate::data::OrchestrationSummary {
            feature: state.feature.clone(),
            worktree_path: PathBuf::from(&state.worktree_path),
            status: crate::data::MonitorOrchestrationStatus::from_orchestration_status(&state.status),
            current_phase: state.current_phase,
            total_phases: state.total_phases,
            elapsed_mins: None,
        })
    }
}

/// Load supervisor state from a tina directory.
fn load_supervisor_state(tina_dir: &Path) -> Result<SupervisorState> {
    let path = tina_dir.join("supervisor-state.json");
    let content = fs::read_to_string(&path)
        .context(format!("Failed to read supervisor state: {}", path.display()))?;
    serde_json::from_str(&content).context("Failed to parse supervisor state JSON")
}
