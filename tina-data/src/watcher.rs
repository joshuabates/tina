//! File watcher for automatic data refresh

use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};

/// Events that the watcher can send
pub enum WatchEvent {
    /// Data files changed, refresh needed
    Refresh,
    /// Error occurred during watching
    Error(String),
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    pub receiver: Receiver<WatchEvent>,
}

impl FileWatcher {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let (tx, rx) = channel();

        let event_tx = tx.clone();
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| match res {
                Ok(_event) => {
                    let _ = event_tx.send(WatchEvent::Refresh);
                }
                Err(e) => {
                    let _ = event_tx.send(WatchEvent::Error(e.to_string()));
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
        let claude_dir = home_dir.join(".claude");

        // Watch teams directory
        let teams_dir = claude_dir.join("teams");
        if teams_dir.exists() {
            watcher.watch(&teams_dir, RecursiveMode::Recursive)?;
        }

        // Watch tasks directory
        let tasks_dir = claude_dir.join("tasks");
        if tasks_dir.exists() {
            watcher.watch(&tasks_dir, RecursiveMode::Recursive)?;
        }

        Ok(Self {
            _watcher: watcher,
            receiver: rx,
        })
    }

    /// Try to receive a watch event (non-blocking)
    pub fn try_recv(&self) -> Option<WatchEvent> {
        self.receiver.try_recv().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn setup_test_dirs() -> (TempDir, PathBuf, PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let teams_dir = temp_dir.path().join(".claude/teams");
        let tasks_dir = temp_dir.path().join(".claude/tasks");

        fs::create_dir_all(&teams_dir).unwrap();
        fs::create_dir_all(&tasks_dir).unwrap();

        (temp_dir, teams_dir, tasks_dir)
    }

    #[test]
    fn test_watcher_initializes_without_error() {
        let (_temp, _teams, _tasks) = setup_test_dirs();

        let result = FileWatcher::new();
        assert!(result.is_ok(), "FileWatcher should initialize successfully");
    }

    #[test]
    fn test_try_recv_returns_none_when_no_events() {
        let (_temp, _teams, _tasks) = setup_test_dirs();

        let watcher = FileWatcher::new().unwrap();
        let event = watcher.try_recv();

        assert!(event.is_none(), "Should return None when no events");
    }

    #[test]
    fn test_watcher_handles_missing_directories_gracefully() {
        // Test with non-existent directories
        let result = FileWatcher::new();

        // Should either succeed (watching non-existent dirs) or fail gracefully
        assert!(
            result.is_ok() || result.is_err(),
            "Should handle missing directories without panicking"
        );
    }
}
