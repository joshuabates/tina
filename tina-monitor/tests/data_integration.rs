use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;
use tina_monitor::data::DataSource;
use tina_monitor::types::*;

/// Setup fixture in a temp directory
fn setup_fixture() -> (TempDir, PathBuf) {
    // Get the current working directory and navigate to fixture
    let cwd = std::env::current_dir().expect("Failed to get current directory");
    let source_fixture = if cwd.ends_with("tina-monitor") {
        cwd.join("tests/fixtures/sample-orchestration")
    } else {
        // If running from parent directory
        cwd.join("tina-monitor/tests/fixtures/sample-orchestration")
    };

    if !source_fixture.exists() {
        panic!("Fixture not found at: {:?}", source_fixture);
    }

    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let dest_fixture = temp_dir.path().to_path_buf();

    copy_fixture_with_replacements(&source_fixture, &dest_fixture, &dest_fixture)
        .expect("Failed to copy fixture");

    // Return the fixture root path (DataSource will append .claude itself)
    (temp_dir, dest_fixture)
}

/// Copy fixture directory recursively, replacing FIXTURE_ROOT placeholders in JSON files.
/// Also renames "claude-data" directories to ".claude" (to work around gitignore).
fn copy_fixture_with_replacements(src: &Path, dest: &Path, fixture_root: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();

        // Rename "claude-data" to ".claude" when copying (to work around gitignore)
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

            // Replace FIXTURE_ROOT with actual fixture root directory path
            let fixture_root_str = fixture_root.to_string_lossy().to_string();
            let updated_content = content.replace("FIXTURE_ROOT", &fixture_root_str);

            fs::write(&dest_path, updated_content)?;
        }
    }

    Ok(())
}

#[test]
fn test_list_orchestrations() {
    let (_temp_dir, fixture_path) = setup_fixture();
    let ds = DataSource::new(Some(fixture_path));

    let result = ds.list_orchestrations();
    assert!(result.is_ok());

    let orchestrations = result.unwrap();
    assert_eq!(orchestrations.len(), 1, "Should find one orchestration");
    assert_eq!(orchestrations[0].feature, "test-feature");
    assert_eq!(orchestrations[0].current_phase, 2);
    assert_eq!(orchestrations[0].total_phases, 3);
}

#[test]
fn test_load_orchestration() {
    let (_temp_dir, fixture_path) = setup_fixture();
    let ds = DataSource::new(Some(fixture_path.clone()));

    let tina_dir = fixture_path.join("test-feature").join(".claude").join("tina");
    let result = ds.load_supervisor_state(&tina_dir);

    assert!(result.is_ok());
    let state = result.unwrap();

    assert_eq!(state.feature, "test-feature");
    assert_eq!(state.current_phase, 2);
    assert_eq!(state.total_phases, 3);
    assert_eq!(state.status, OrchestrationStatus::Executing);
    assert_eq!(state.branch, "tina/test-feature");
}

#[test]
fn test_load_team() {
    let (_temp_dir, fixture_path) = setup_fixture();
    let ds = DataSource::new(Some(fixture_path));

    let result = ds.load_team("test-feature-orchestration");
    assert!(result.is_ok());

    let team = result.unwrap();
    assert_eq!(team.name, "test-feature-orchestration");
    assert_eq!(team.lead_agent_id, "team-lead");
    assert_eq!(team.members.len(), 2);
}

#[test]
fn test_load_tasks() {
    let (_temp_dir, fixture_path) = setup_fixture();
    let ds = DataSource::new(Some(fixture_path));

    let result = ds.load_tasks("test-feature-orchestration");
    assert!(result.is_ok());

    let tasks = result.unwrap();
    assert_eq!(tasks.len(), 2);

    // Verify tasks are sorted by id
    assert_eq!(tasks[0].id, "1");
    assert_eq!(tasks[1].id, "2");

    // Verify task 1 content
    assert_eq!(tasks[0].subject, "Plan phase 1");
    assert_eq!(tasks[0].status, TaskStatus::Completed);

    // Verify task 2 content
    assert_eq!(tasks[1].subject, "Execute phase 1");
    assert_eq!(tasks[1].status, TaskStatus::InProgress);
}
