//! Integration tests for orchestration discovery
//!
//! These tests verify that list_orchestrations() correctly discovers
//! orchestration state from supervisor-state.json files in worktree directories.

use std::fs;
use std::path::Path;
use tempfile::TempDir;

/// Copy fixture to temp directory, replacing FIXTURE_ROOT placeholders with temp path
/// Also renames "claude-data" directories to ".claude" (to work around gitignore)
fn copy_fixture_with_replacements(
    src: &Path,
    dest: &Path,
    fixture_root: &Path,
) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();

        // Rename "claude-data" to ".claude" when copying
        let dest_name = if file_name == "claude-data" {
            std::ffi::OsString::from(".claude")
        } else {
            file_name
        };
        let dest_path = dest.join(&dest_name);

        if path.is_dir() {
            copy_fixture_with_replacements(&path, &dest_path, fixture_root)?;
        } else {
            let content = fs::read_to_string(&path)?;
            let fixture_root_str = fixture_root.to_string_lossy().to_string();
            let updated_content = content.replace("FIXTURE_ROOT", &fixture_root_str);
            fs::write(&dest_path, updated_content)?;
        }
    }

    Ok(())
}

/// Setup fixture in a temp directory
fn setup_fixture(fixture_name: &str) -> (TempDir, std::path::PathBuf) {
    let cwd = std::env::current_dir().expect("Failed to get current directory");
    let source_fixture = if cwd.ends_with("tina-monitor") {
        cwd.join("tests/fixtures").join(fixture_name)
    } else {
        cwd.join("tina-monitor/tests/fixtures").join(fixture_name)
    };

    if !source_fixture.exists() {
        panic!("Fixture not found at: {:?}", source_fixture);
    }

    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let dest_fixture = temp_dir.path().to_path_buf();

    copy_fixture_with_replacements(&source_fixture, &dest_fixture, &dest_fixture)
        .expect("Failed to copy fixture");

    (temp_dir, dest_fixture)
}

/// Test that list_orchestrations() discovers orchestrations by scanning
/// for supervisor-state.json under feature directories.
#[test]
fn test_discover_orchestration_from_worktree_path() {
    let (_temp_dir, fixture_path) = setup_fixture("orchestration-e2e");
    let ds = tina_monitor::data::DataSource::new(Some(fixture_path));

    // List orchestrations should find our test orchestration
    let orchestrations = ds.list_orchestrations().expect("list_orchestrations should succeed");

    assert!(
        !orchestrations.is_empty(),
        "Should discover at least one orchestration"
    );

    // Find our test feature
    let test_feature = orchestrations
        .iter()
        .find(|o| o.feature == "my-feature")
        .expect("Should find my-feature orchestration");

    // Verify basic fields
    assert_eq!(test_feature.current_phase, 2);
    assert_eq!(test_feature.total_phases, 3);
    assert_eq!(
        test_feature.status,
        tina_monitor::types::MonitorOrchestrationStatus::Executing
    );
}

/// Test that tasks are loaded using lead_session_id (how Claude stores them)
#[test]
fn test_tasks_loaded_by_session_id() {
    let (_temp_dir, fixture_path) = setup_fixture("orchestration-e2e");
    let ds = tina_monitor::data::DataSource::new(Some(fixture_path));

    // Load tasks using the lead_session_id (as stored by Claude)
    let tasks = ds.load_tasks("session-abc-123");
    assert!(tasks.is_ok(), "load_tasks should succeed: {:?}", tasks);

    let tasks = tasks.unwrap();
    assert_eq!(tasks.len(), 3, "Should have 3 tasks");

    // Verify tasks are sorted by id
    assert_eq!(tasks[0].id, "1");
    assert_eq!(tasks[1].id, "2");
    assert_eq!(tasks[2].id, "3");

    // Verify task subjects
    assert_eq!(tasks[0].subject, "Validate design");
    assert_eq!(tasks[1].subject, "Setup worktree");
    assert_eq!(tasks[2].subject, "Plan phase 1");
}

/// Test that supervisor state is loaded directly from the feature's tina directory
#[test]
fn test_supervisor_state_loaded_from_feature_dir() {
    let (_temp_dir, fixture_path) = setup_fixture("orchestration-e2e");
    let ds = tina_monitor::data::DataSource::new(Some(fixture_path.clone()));

    // Load supervisor state from the feature's tina directory
    let tina_dir = fixture_path.join("my-feature").join(".claude").join("tina");
    let state = ds.load_supervisor_state(&tina_dir).unwrap();

    // Verify fields
    assert_eq!(state.feature, "my-feature");
    assert_eq!(state.current_phase, 2);
    assert_eq!(state.total_phases, 3);
}
