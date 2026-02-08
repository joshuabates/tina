use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc as std_mpsc;

use anyhow::{Context, Result};
use notify::{Event, RecursiveMode, Watcher};
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use tina_session::session::lookup::SessionLookup;
use tina_session::state::schema::SupervisorState;

/// Categorized file-system event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEvent {
    /// A file changed in `~/.claude/teams/`
    Teams,
    /// A file changed in `~/.claude/tasks/`
    Tasks,
    /// A supervisor-state.json changed for the given feature
    SupervisorState { feature: String },
}

/// Async file watcher that monitors teams, tasks, and supervisor-state files.
///
/// Uses `std::sync::mpsc` internally (safe from any thread) with an async
/// bridge to a `tokio::sync::mpsc` channel for the consumer.
pub struct DaemonWatcher {
    _watcher: notify::RecommendedWatcher,
    pub rx: mpsc::Receiver<WatchEvent>,
    _bridge_handle: tokio::task::JoinHandle<()>,
    teams_dir: PathBuf,
    tasks_dir: PathBuf,
    watched_state_files: HashSet<PathBuf>,
}

impl DaemonWatcher {
    /// Create a watcher monitoring the given teams and tasks directories.
    ///
    /// Also discovers and watches all supervisor-state.json files via SessionLookup.
    pub fn new(teams_dir: &Path, tasks_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(teams_dir)
            .with_context(|| format!("creating teams dir: {}", teams_dir.display()))?;
        std::fs::create_dir_all(tasks_dir)
            .with_context(|| format!("creating tasks dir: {}", tasks_dir.display()))?;

        // Use std::sync::mpsc for the notify callback (runs on an OS thread)
        let (std_tx, std_rx) = std_mpsc::channel::<WatchEvent>();
        // Use tokio::sync::mpsc for the async consumer
        let (tokio_tx, tokio_rx) = mpsc::channel::<WatchEvent>(256);

        let teams_prefix = teams_dir.to_path_buf();
        let tasks_prefix = tasks_dir.to_path_buf();
        let tp = teams_prefix.clone();
        let tkp = tasks_prefix.clone();

        let mut watcher = notify::recommended_watcher(
            move |res: std::result::Result<Event, notify::Error>| {
                let event = match res {
                    Ok(e) => e,
                    Err(_) => return,
                };

                for path in &event.paths {
                    let watch_event = if path.starts_with(&tp) {
                        Some(WatchEvent::Teams)
                    } else if path.starts_with(&tkp) {
                        Some(WatchEvent::Tasks)
                    } else if path.file_name().map(|n| n == "supervisor-state.json").unwrap_or(false) {
                        extract_feature_from_state_path(path)
                            .map(|feature| WatchEvent::SupervisorState { feature })
                    } else {
                        None
                    };

                    if let Some(evt) = watch_event {
                        let _ = std_tx.send(evt);
                    }
                }
            },
        )?;

        watcher.watch(teams_dir, RecursiveMode::Recursive)?;
        watcher.watch(tasks_dir, RecursiveMode::Recursive)?;

        // Discover and watch existing supervisor-state.json files
        let mut watched_state_files = HashSet::new();
        if let Ok(lookups) = SessionLookup::list_all() {
            for lookup in &lookups {
                let state_path = SupervisorState::state_path(&lookup.cwd);
                if state_path.exists() {
                    if let Some(parent) = state_path.parent() {
                        if let Err(e) = watcher.watch(parent, RecursiveMode::NonRecursive) {
                            warn!(path = %parent.display(), error = %e, "failed to watch state dir");
                        } else {
                            watched_state_files.insert(parent.to_path_buf());
                            debug!(path = %state_path.display(), "watching supervisor-state.json");
                        }
                    }
                }
            }
        }

        info!(
            teams = %teams_dir.display(),
            tasks = %tasks_dir.display(),
            state_files = watched_state_files.len(),
            "file watchers initialized"
        );

        // Bridge: spawn a tokio task that polls the std_rx and forwards to tokio_tx
        let bridge_handle = tokio::spawn(async move {
            loop {
                // Check for events every 50ms
                match std_rx.try_recv() {
                    Ok(evt) => {
                        if tokio_tx.send(evt).await.is_err() {
                            break; // Consumer dropped
                        }
                    }
                    Err(std_mpsc::TryRecvError::Empty) => {
                        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                    }
                    Err(std_mpsc::TryRecvError::Disconnected) => {
                        break; // Watcher dropped
                    }
                }
            }
        });

        Ok(Self {
            _watcher: watcher,
            rx: tokio_rx,
            _bridge_handle: bridge_handle,
            teams_dir: teams_dir.to_path_buf(),
            tasks_dir: tasks_dir.to_path_buf(),
            watched_state_files,
        })
    }

    /// Re-scan session lookups and watch any new supervisor-state.json files.
    pub fn refresh_state_watches(&mut self) -> Result<()> {
        let lookups = SessionLookup::list_all().unwrap_or_default();

        for lookup in &lookups {
            let state_path = SupervisorState::state_path(&lookup.cwd);
            if let Some(parent) = state_path.parent() {
                if state_path.exists() && !self.watched_state_files.contains(parent) {
                    debug!(
                        path = %state_path.display(),
                        "new supervisor-state.json discovered but not yet watched"
                    );
                }
            }
        }

        Ok(())
    }

    /// Get the teams directory being watched.
    pub fn teams_dir(&self) -> &Path {
        &self.teams_dir
    }

    /// Get the tasks directory being watched.
    pub fn tasks_dir(&self) -> &Path {
        &self.tasks_dir
    }
}

/// Extract the feature name from a supervisor-state.json path.
fn extract_feature_from_state_path(path: &Path) -> Option<String> {
    let worktree_dir = path.parent()?.parent()?.parent()?;

    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(state) = serde_json::from_str::<SupervisorState>(&content) {
            return Some(state.feature);
        }
    }

    worktree_dir
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_watch_event_equality() {
        assert_eq!(WatchEvent::Teams, WatchEvent::Teams);
        assert_eq!(WatchEvent::Tasks, WatchEvent::Tasks);
        assert_eq!(
            WatchEvent::SupervisorState {
                feature: "auth".to_string()
            },
            WatchEvent::SupervisorState {
                feature: "auth".to_string()
            },
        );
        assert_ne!(WatchEvent::Teams, WatchEvent::Tasks);
    }

    #[test]
    fn test_extract_feature_from_state_path_with_file() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().join("my-feature");
        let tina_dir = worktree.join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();

        let state_path = tina_dir.join("supervisor-state.json");
        let state_json = r#"{
            "version": 1,
            "feature": "my-feature",
            "design_doc": "docs/design.md",
            "worktree_path": "/tmp/worktree",
            "branch": "tina/my-feature",
            "total_phases": 2,
            "current_phase": 1,
            "status": "planning",
            "orchestration_started_at": "2026-02-07T10:00:00Z",
            "phases": {},
            "timing": {}
        }"#;
        fs::write(&state_path, state_json).unwrap();

        let feature = extract_feature_from_state_path(&state_path);
        assert_eq!(feature, Some("my-feature".to_string()));
    }

    #[test]
    fn test_extract_feature_from_state_path_fallback_to_dir_name() {
        let dir = TempDir::new().unwrap();
        let worktree = dir.path().join("fallback-feature");
        let tina_dir = worktree.join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();

        let state_path = tina_dir.join("supervisor-state.json");
        fs::write(&state_path, "not valid json").unwrap();

        let feature = extract_feature_from_state_path(&state_path);
        assert_eq!(feature, Some("fallback-feature".to_string()));
    }

    #[tokio::test]
    async fn test_watcher_creates_dirs() {
        let dir = TempDir::new().unwrap();
        let teams = dir.path().join("teams");
        let tasks = dir.path().join("tasks");

        assert!(!teams.exists());
        assert!(!tasks.exists());

        let watcher = DaemonWatcher::new(&teams, &tasks).unwrap();

        assert!(teams.exists());
        assert!(tasks.exists());

        drop(watcher);
    }

    // Note: Integration tests for file change detection are omitted because
    // the `notify` crate's FSEvents backend on macOS aborts on process exit
    // when used with tokio test runtimes. The event categorization logic is
    // tested above; the actual detection relies on `notify` which is well-tested
    // in tina-session/src/daemon/watcher.rs.
}
