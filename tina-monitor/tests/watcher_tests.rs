use std::fs;
use std::thread;
use std::time::Duration;
use tempfile::TempDir;
use tina_monitor::watcher::DataWatcher;

fn setup_test_dirs() -> TempDir {
    let temp_dir = TempDir::new().unwrap();
    fs::create_dir_all(temp_dir.path().join(".claude/tina-sessions")).unwrap();
    fs::create_dir_all(temp_dir.path().join(".claude/teams")).unwrap();
    fs::create_dir_all(temp_dir.path().join(".claude/tasks")).unwrap();
    temp_dir
}

#[test]
fn test_data_watcher_creates_successfully() {
    let temp_dir = setup_test_dirs();
    let watcher = DataWatcher::with_home(None, temp_dir.path());
    assert!(watcher.is_ok(), "DataWatcher should create successfully");
}

#[test]
fn test_data_watcher_with_worktree_creates_successfully() {
    let home_dir = setup_test_dirs();
    let worktree_path = TempDir::new().unwrap();
    fs::create_dir_all(worktree_path.path().join(".claude/tina")).unwrap();

    let watcher = DataWatcher::with_home(Some(worktree_path.path()), home_dir.path());
    assert!(
        watcher.is_ok(),
        "DataWatcher should create successfully with worktree"
    );
}

#[test]
fn test_has_changes_returns_false_initially() {
    let temp_dir = setup_test_dirs();
    let watcher = DataWatcher::with_home(None, temp_dir.path()).unwrap();

    assert!(
        !watcher.has_changes(),
        "has_changes should return false when no changes"
    );
}

#[test]
fn test_has_changes_detects_file_changes() {
    let temp_dir = setup_test_dirs();
    let watcher = DataWatcher::with_home(None, temp_dir.path()).unwrap();

    // Create a file in teams directory to trigger watch
    let teams_dir = temp_dir.path().join(".claude/teams");
    let test_file = teams_dir.join("test.json");
    fs::write(&test_file, "test").unwrap();

    // Give watcher time to process event
    thread::sleep(Duration::from_millis(500));

    assert!(
        watcher.has_changes(),
        "has_changes should return true after file creation"
    );

    // Second call should return false (events drained)
    assert!(
        !watcher.has_changes(),
        "has_changes should return false after events drained"
    );
}

#[test]
fn test_has_changes_detects_task_changes() {
    let temp_dir = setup_test_dirs();
    let watcher = DataWatcher::with_home(None, temp_dir.path()).unwrap();

    // Create a file in tasks directory
    let tasks_dir = temp_dir.path().join(".claude/tasks");
    let test_file = tasks_dir.join("test.json");
    fs::write(&test_file, "test").unwrap();

    // Give watcher time to process event
    thread::sleep(Duration::from_millis(500));

    assert!(
        watcher.has_changes(),
        "has_changes should detect changes in tasks directory"
    );
}

#[test]
fn test_has_changes_drains_all_pending_events() {
    let temp_dir = setup_test_dirs();
    let watcher = DataWatcher::with_home(None, temp_dir.path()).unwrap();

    // Create multiple files to generate multiple events
    let teams_dir = temp_dir.path().join(".claude/teams");
    fs::write(teams_dir.join("file1.json"), "test").unwrap();
    fs::write(teams_dir.join("file2.json"), "test").unwrap();
    fs::write(teams_dir.join("file3.json"), "test").unwrap();

    // Give watcher time to process events
    thread::sleep(Duration::from_millis(500));

    // Single call to has_changes should drain all events and return true
    assert!(watcher.has_changes(), "Should detect changes");

    // Next call should return false (all events drained)
    assert!(
        !watcher.has_changes(),
        "All events should be drained after single call"
    );
}

#[test]
fn test_data_watcher_watches_tina_sessions() {
    let temp_dir = setup_test_dirs();
    let watcher = DataWatcher::with_home(None, temp_dir.path()).unwrap();

    // Create a file in tina-sessions directory
    let sessions_dir = temp_dir.path().join(".claude/tina-sessions");
    let test_file = sessions_dir.join("session.json");
    fs::write(&test_file, "test").unwrap();

    // Give watcher time to process event
    thread::sleep(Duration::from_millis(500));

    assert!(
        watcher.has_changes(),
        "should detect changes in tina-sessions directory"
    );
}

#[test]
fn test_data_watcher_watches_worktree_tina_directory() {
    let home_dir = setup_test_dirs();
    let worktree_path = TempDir::new().unwrap();
    fs::create_dir_all(worktree_path.path()).unwrap();
    let tina_dir = worktree_path.path().join(".claude/tina");
    fs::create_dir_all(&tina_dir).unwrap();

    let watcher = DataWatcher::with_home(Some(worktree_path.path()), home_dir.path()).unwrap();

    // Create a file in worktree tina directory
    let test_file = tina_dir.join("test.json");
    fs::write(&test_file, "test").unwrap();

    // Give watcher time to process event
    thread::sleep(Duration::from_millis(500));

    assert!(
        watcher.has_changes(),
        "should detect changes in worktree .claude/tina directory"
    );
}
