//! Data modules for tina-monitor

pub mod discovery;
pub mod tasks;
pub mod teams;
pub mod tina_state;
pub mod types;
pub mod watcher;

use std::path::PathBuf;
use anyhow::Result;
use crate::types::*;

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
        // Placeholder: will be implemented in Task 4
        Ok(vec![])
    }

    /// Load full orchestration data for a feature
    pub fn load_orchestration(&mut self, feature: &str) -> Result<&Orchestration> {
        // Placeholder: will be implemented in Task 4
        // For now just return the currently loaded orchestration if it exists
        Ok(self.current.as_ref().ok_or_else(|| {
            anyhow::anyhow!("No orchestration loaded for feature: {}", feature)
        })?)
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
}
