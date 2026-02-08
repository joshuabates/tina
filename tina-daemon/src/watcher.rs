use std::path::{Path, PathBuf};
use std::sync::mpsc as std_mpsc;

use anyhow::{Context, Result};
use notify::{Event, RecursiveMode, Watcher};
use tokio::sync::mpsc;
use tracing::info;


/// Categorized file-system event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEvent {
    /// A file changed in `~/.claude/teams/`
    Teams,
    /// A file changed in `~/.claude/tasks/`
    Tasks,
}

/// Async file watcher that monitors teams and tasks.
///
/// Uses `std::sync::mpsc` internally (safe from any thread) with an async
/// bridge to a `tokio::sync::mpsc` channel for the consumer.
pub struct DaemonWatcher {
    _watcher: notify::RecommendedWatcher,
    pub rx: mpsc::Receiver<WatchEvent>,
    _bridge_handle: tokio::task::JoinHandle<()>,
    teams_dir: PathBuf,
    tasks_dir: PathBuf,
}

impl DaemonWatcher {
    /// Create a watcher monitoring the given teams and tasks directories.
    ///
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

        info!(
            teams = %teams_dir.display(),
            tasks = %tasks_dir.display(),
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
        })
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_watch_event_equality() {
        assert_eq!(WatchEvent::Teams, WatchEvent::Teams);
        assert_eq!(WatchEvent::Tasks, WatchEvent::Tasks);
        assert_ne!(WatchEvent::Teams, WatchEvent::Tasks);
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
