use std::path::{Path, PathBuf};
use std::sync::mpsc as std_mpsc;
use std::sync::{Arc, RwLock};

use anyhow::{Context, Result};
use notify::{Event, RecursiveMode, Watcher};
use tokio::sync::mpsc;
use tracing::info;

/// Worktree information for watching git refs and plans.
#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub orchestration_id: String,
    pub feature: String,
    pub worktree_path: PathBuf,
    pub branch: String,
    pub current_phase: String,
    pub git_dir_path: Option<PathBuf>,
    pub branch_ref_path: Option<PathBuf>,
}

/// Categorized file-system event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEvent {
    /// A file changed in `~/.claude/teams/`
    Teams,
    /// A file changed in `~/.claude/tasks/`
    Tasks,
    /// A git ref changed (commit detected)
    GitRef(PathBuf),
    /// A plan file changed
    Plan(PathBuf),
    /// A design set file changed (meta.ts or screenshots)
    Design(PathBuf),
}

/// Async file watcher that monitors teams, tasks, git refs, and plans.
///
/// Uses `std::sync::mpsc` internally (safe from any thread) with an async
/// bridge to a `tokio::sync::mpsc` channel for the consumer.
pub struct DaemonWatcher {
    watcher: notify::RecommendedWatcher,
    pub rx: mpsc::Receiver<WatchEvent>,
    _bridge_handle: tokio::task::JoinHandle<()>,
    teams_dir: PathBuf,
    tasks_dir: PathBuf,
    git_ref_paths: Vec<PathBuf>,
    plan_dirs: Vec<PathBuf>,
    design_dirs: Vec<PathBuf>,
    /// Shared with the notify callback so dynamically-added design dirs
    /// are visible to `classify_watch_path`.
    design_dirs_shared: Arc<RwLock<Vec<PathBuf>>>,
}

fn is_heads_ref_path(path: &Path) -> bool {
    let refs = std::ffi::OsStr::new("refs");
    let heads = std::ffi::OsStr::new("heads");
    let mut saw_refs = false;

    for component in path.components() {
        let name = component.as_os_str();
        if saw_refs && name == heads {
            return true;
        }
        saw_refs = name == refs;
    }

    false
}

fn is_design_file(path: &Path) -> bool {
    let file_name = path.file_name().and_then(|f| f.to_str());
    if file_name == Some("meta.ts") {
        return true;
    }
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("png" | "jpg" | "webp")
    )
}

fn classify_watch_path(
    path: &Path,
    teams_prefix: &Path,
    tasks_prefix: &Path,
    design_dirs: &[PathBuf],
) -> Option<WatchEvent> {
    if path.starts_with(teams_prefix) {
        return Some(WatchEvent::Teams);
    }
    if path.starts_with(tasks_prefix) {
        return Some(WatchEvent::Tasks);
    }

    let file_name = path.file_name();
    if file_name == Some(std::ffi::OsStr::new("HEAD"))
        || file_name == Some(std::ffi::OsStr::new("packed-refs"))
        || is_heads_ref_path(path)
    {
        return Some(WatchEvent::GitRef(path.to_path_buf()));
    }

    // Check design dirs before plan (.md) check
    if is_design_file(path) {
        for dir in design_dirs {
            if path.starts_with(dir) {
                return Some(WatchEvent::Design(path.to_path_buf()));
            }
        }
    }

    if path.extension() == Some(std::ffi::OsStr::new("md")) {
        return Some(WatchEvent::Plan(path.to_path_buf()));
    }

    None
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
        let design_dirs_shared: Arc<RwLock<Vec<PathBuf>>> =
            Arc::new(RwLock::new(Vec::new()));
        let dd = design_dirs_shared.clone();

        let mut watcher =
            notify::recommended_watcher(move |res: std::result::Result<Event, notify::Error>| {
                let event = match res {
                    Ok(e) => e,
                    Err(_) => return,
                };

                let dirs = dd.read().unwrap_or_else(|e| e.into_inner());
                for path in &event.paths {
                    let watch_event = classify_watch_path(path, &tp, &tkp, &dirs);

                    if let Some(evt) = watch_event {
                        let _ = std_tx.send(evt);
                    }
                }
            })?;

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
            watcher,
            rx: tokio_rx,
            _bridge_handle: bridge_handle,
            teams_dir: teams_dir.to_path_buf(),
            tasks_dir: tasks_dir.to_path_buf(),
            git_ref_paths: Vec::new(),
            plan_dirs: Vec::new(),
            design_dirs: Vec::new(),
            design_dirs_shared,
        })
    }

    /// Watch a specific git ref file (e.g., `.git/refs/heads/main`).
    pub fn watch_git_ref(&mut self, ref_path: &Path) -> Result<()> {
        if !self.git_ref_paths.contains(&ref_path.to_path_buf()) {
            self.watcher
                .watch(ref_path, RecursiveMode::NonRecursive)
                .with_context(|| format!("watching git ref: {}", ref_path.display()))?;
            self.git_ref_paths.push(ref_path.to_path_buf());
        }
        Ok(())
    }

    /// Watch a specific plan directory (e.g., `docs/plans`).
    pub fn watch_plan_dir(&mut self, plan_dir: &Path) -> Result<()> {
        if !self.plan_dirs.contains(&plan_dir.to_path_buf()) {
            self.watcher
                .watch(plan_dir, RecursiveMode::NonRecursive)
                .with_context(|| format!("watching plan dir: {}", plan_dir.display()))?;
            self.plan_dirs.push(plan_dir.to_path_buf());
        }
        Ok(())
    }

    /// Watch a specific design sets directory (e.g., `ui/designs/sets`).
    pub fn watch_design_dir(&mut self, design_dir: &Path) -> Result<()> {
        if !self.design_dirs.contains(&design_dir.to_path_buf()) {
            self.watcher
                .watch(design_dir, RecursiveMode::Recursive)
                .with_context(|| format!("watching design dir: {}", design_dir.display()))?;
            self.design_dirs.push(design_dir.to_path_buf());
            if let Ok(mut shared) = self.design_dirs_shared.write() {
                shared.push(design_dir.to_path_buf());
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use tempfile::TempDir;

    #[test]
    fn test_watch_event_equality() {
        assert_eq!(WatchEvent::Teams, WatchEvent::Teams);
        assert_eq!(WatchEvent::Tasks, WatchEvent::Tasks);
        assert_ne!(WatchEvent::Teams, WatchEvent::Tasks);
    }

    #[test]
    fn test_classify_nested_branch_ref_as_git_ref() {
        let teams = Path::new("/tmp/teams");
        let tasks = Path::new("/tmp/tasks");
        let path = Path::new("/repo/.git/refs/heads/tina/my-feature");

        assert_eq!(
            classify_watch_path(path, teams, tasks, &[]),
            Some(WatchEvent::GitRef(path.to_path_buf()))
        );
    }

    #[test]
    fn test_classify_head_and_packed_refs_as_git_ref() {
        let teams = Path::new("/tmp/teams");
        let tasks = Path::new("/tmp/tasks");

        let head = Path::new("/repo/.git/worktrees/x/HEAD");
        let packed = Path::new("/repo/.git/packed-refs");

        assert_eq!(
            classify_watch_path(head, teams, tasks, &[]),
            Some(WatchEvent::GitRef(head.to_path_buf()))
        );
        assert_eq!(
            classify_watch_path(packed, teams, tasks, &[]),
            Some(WatchEvent::GitRef(packed.to_path_buf()))
        );
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

    #[test]
    fn test_classify_design_meta_ts() {
        let teams = Path::new("/tmp/teams");
        let tasks = Path::new("/tmp/tasks");
        let design_dirs = vec![PathBuf::from(
            "/project/.worktrees/test/ui/designs/sets",
        )];
        let path = Path::new(
            "/project/.worktrees/test/ui/designs/sets/my-design/meta.ts",
        );

        assert_eq!(
            classify_watch_path(path, teams, tasks, &design_dirs),
            Some(WatchEvent::Design(path.to_path_buf()))
        );
    }

    #[test]
    fn test_classify_design_image_files() {
        let teams = Path::new("/tmp/teams");
        let tasks = Path::new("/tmp/tasks");
        let design_dirs = vec![PathBuf::from(
            "/project/.worktrees/test/ui/designs/sets",
        )];

        for ext in &["png", "jpg", "webp"] {
            let path_str = format!(
                "/project/.worktrees/test/ui/designs/sets/my-design/variation-a/screenshot.{}",
                ext
            );
            let path = Path::new(&path_str);
            assert_eq!(
                classify_watch_path(path, teams, tasks, &design_dirs),
                Some(WatchEvent::Design(path.to_path_buf())),
                "expected Design event for .{} file",
                ext
            );
        }
    }

    #[test]
    fn test_classify_non_design_file_in_design_dir() {
        let teams = Path::new("/tmp/teams");
        let tasks = Path::new("/tmp/tasks");
        let design_dirs = vec![PathBuf::from(
            "/project/.worktrees/test/ui/designs/sets",
        )];

        // A .ts file that's not meta.ts should not classify as Design
        let path = Path::new(
            "/project/.worktrees/test/ui/designs/sets/my-design/index.ts",
        );
        assert_eq!(
            classify_watch_path(path, teams, tasks, &design_dirs),
            None
        );
    }

    #[test]
    fn test_classify_design_file_outside_design_dir() {
        let teams = Path::new("/tmp/teams");
        let tasks = Path::new("/tmp/tasks");
        let design_dirs = vec![PathBuf::from(
            "/project/.worktrees/test/ui/designs/sets",
        )];

        // A meta.ts outside the design dir should not classify
        let path = Path::new("/other/project/meta.ts");
        assert_eq!(
            classify_watch_path(path, teams, tasks, &design_dirs),
            None
        );
    }

    // Note: Integration tests for file change detection are omitted because
    // the `notify` crate's FSEvents backend on macOS aborts on process exit
    // when used with tokio test runtimes. The event categorization logic is
    // tested above; the actual detection relies on `notify` which is well-tested
    // in tina-session/src/daemon/watcher.rs.
}
