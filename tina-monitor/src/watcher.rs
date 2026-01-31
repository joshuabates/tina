use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::mpsc::{channel, Receiver, TryRecvError};
use std::time::Duration;
use std::path::Path;
use anyhow::Result;

pub struct DataWatcher {
    _watcher: RecommendedWatcher,
    receiver: Receiver<()>,
}

impl DataWatcher {
    /// Create a watcher for orchestration data changes
    pub fn new(worktree: Option<&Path>) -> Result<Self> {
        let home_dir = dirs::home_dir().ok_or(anyhow::anyhow!("Could not find home directory"))?;
        Self::with_home(worktree, &home_dir)
    }

    /// Create a watcher with custom home directory (for testing)
    pub fn with_home(worktree: Option<&Path>, home_dir: &Path) -> Result<Self> {
        let (tx, rx) = channel();

        let event_tx = tx.clone();
        let mut watcher = RecommendedWatcher::new(
            move |_res: notify::Result<notify::Event>| {
                let _ = event_tx.send(());
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        let claude_dir = home_dir.join(".claude");

        // Watch ~/.claude/tina-sessions (NonRecursive)
        let tina_sessions = claude_dir.join("tina-sessions");
        if tina_sessions.exists() {
            watcher.watch(&tina_sessions, RecursiveMode::NonRecursive)?;
        }

        // Watch ~/.claude/teams (Recursive)
        let teams_dir = claude_dir.join("teams");
        if teams_dir.exists() {
            watcher.watch(&teams_dir, RecursiveMode::Recursive)?;
        }

        // Watch ~/.claude/tasks (Recursive)
        let tasks_dir = claude_dir.join("tasks");
        if tasks_dir.exists() {
            watcher.watch(&tasks_dir, RecursiveMode::Recursive)?;
        }

        // Watch {worktree}/.claude/tina if worktree provided (NonRecursive)
        if let Some(worktree_path) = worktree {
            let worktree_tina = worktree_path.join(".claude/tina");
            if worktree_tina.exists() {
                watcher.watch(&worktree_tina, RecursiveMode::NonRecursive)?;
            }
        }

        Ok(Self {
            _watcher: watcher,
            receiver: rx,
        })
    }

    /// Check if any files have changed (non-blocking)
    pub fn has_changes(&self) -> bool {
        let mut has_event = false;
        loop {
            match self.receiver.try_recv() {
                Ok(()) => {
                    has_event = true;
                }
                Err(TryRecvError::Empty) => {
                    break;
                }
                Err(TryRecvError::Disconnected) => {
                    break;
                }
            }
        }
        has_event
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_data_watcher_new_returns_ok() {
        let watcher = DataWatcher::new(None);
        assert!(watcher.is_ok());
    }
}
