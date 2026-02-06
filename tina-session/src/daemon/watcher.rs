use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use notify::{Event, RecursiveMode, Watcher};

/// Watches `~/.claude/teams/` and `~/.claude/tasks/` for file changes.
///
/// Uses an mpsc channel to collect events, then drains them on `has_changes()`.
pub struct DaemonWatcher {
    _watcher: notify::RecommendedWatcher,
    rx: mpsc::Receiver<()>,
}

impl DaemonWatcher {
    /// Create a new watcher that monitors the teams and tasks directories.
    ///
    /// Creates the directories if they don't exist.
    pub fn new(teams_dir: &Path, tasks_dir: &Path) -> anyhow::Result<Self> {
        // Ensure directories exist
        std::fs::create_dir_all(teams_dir)?;
        std::fs::create_dir_all(tasks_dir)?;

        let (tx, rx) = mpsc::channel();

        let mut watcher =
            notify::recommended_watcher(move |res: std::result::Result<Event, _>| {
                if let Ok(_event) = res {
                    let _ = tx.send(());
                }
            })?;

        watcher.watch(teams_dir, RecursiveMode::Recursive)?;
        watcher.watch(tasks_dir, RecursiveMode::Recursive)?;

        Ok(Self {
            _watcher: watcher,
            rx,
        })
    }

    /// Non-blocking check: drain all pending events and return true if any arrived.
    pub fn has_changes(&self) -> bool {
        let mut changed = false;
        while self.rx.try_recv().is_ok() {
            changed = true;
        }
        changed
    }

    /// Blocking wait for the next change event, with timeout.
    #[allow(dead_code)]
    pub fn wait_for_change(&self, timeout: Duration) -> bool {
        self.rx.recv_timeout(timeout).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_watcher_creates_dirs() {
        let temp = TempDir::new().unwrap();
        let teams = temp.path().join("teams");
        let tasks = temp.path().join("tasks");

        assert!(!teams.exists());
        assert!(!tasks.exists());

        let _watcher = DaemonWatcher::new(&teams, &tasks).unwrap();

        assert!(teams.exists());
        assert!(tasks.exists());
    }

    #[test]
    fn test_has_changes_initially_false() {
        let temp = TempDir::new().unwrap();
        let teams = temp.path().join("teams");
        let tasks = temp.path().join("tasks");

        let watcher = DaemonWatcher::new(&teams, &tasks).unwrap();
        assert!(!watcher.has_changes());
    }

    #[test]
    fn test_detects_file_creation() {
        let temp = TempDir::new().unwrap();
        let teams = temp.path().join("teams");
        let tasks = temp.path().join("tasks");

        let watcher = DaemonWatcher::new(&teams, &tasks).unwrap();

        // Create a file in the watched directory
        std::fs::write(teams.join("test.json"), "{}").unwrap();

        // Give the watcher time to pick up the event
        std::thread::sleep(Duration::from_millis(200));

        assert!(watcher.has_changes());
        // After draining, should be false
        assert!(!watcher.has_changes());
    }
}
