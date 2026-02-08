use tina_monitor::app::App;
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

/// Setup fixture in a temp directory with claude-data → .claude renaming
fn setup_fixture() -> (TempDir, PathBuf) {
    let cwd = std::env::current_dir().expect("Failed to get current directory");
    let source_fixture = if cwd.ends_with("tina-monitor") {
        cwd.join("tests/fixtures/sample-orchestration")
    } else {
        cwd.join("tina-monitor/tests/fixtures/sample-orchestration")
    };

    if !source_fixture.exists() {
        panic!("Fixture not found at: {:?}", source_fixture);
    }

    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let dest = temp_dir.path().to_path_buf();

    copy_fixture(&source_fixture, &dest, &dest).expect("Failed to copy fixture");

    (temp_dir, dest)
}

fn copy_fixture(src: &Path, dest: &Path, fixture_root: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let dest_name = if file_name == "claude-data" {
            std::ffi::OsString::from(".claude")
        } else {
            file_name
        };
        let dest_path = dest.join(&dest_name);

        if path.is_dir() {
            copy_fixture(&path, &dest_path, fixture_root)?;
        } else {
            let content = fs::read_to_string(&path)?;
            let updated = content.replace("FIXTURE_ROOT", &fixture_root.to_string_lossy());
            fs::write(&dest_path, updated)?;
        }
    }
    Ok(())
}

#[test]
fn test_app_loads_orchestration_data() {
    let (_temp_dir, fixture_path) = setup_fixture();
    let mut app = App::with_fixture_path(Some(fixture_path));

    let result = app.load_orchestration("test-feature");
    assert!(result.is_ok(), "Should successfully load test-feature orchestration: {:?}", result.err());
}

#[test]
fn test_dashboard_shows_feature_name() {
    let (_temp_dir, fixture_path) = setup_fixture();
    let mut app = App::with_fixture_path(Some(fixture_path));

    let result = app.load_orchestration("test-feature");
    assert!(result.is_ok(), "Failed to load orchestration: {:?}", result.err());

    assert_eq!(app.dashboard.feature, "test-feature", "Dashboard should show feature name");
}

#[test]
fn test_empty_orchestration_graceful() {
    let app = App::with_fixture_path(None);

    // Should have no data source but still be valid
    assert!(app.data_source.is_none(), "App with no fixture should have no data source");
    assert!(app.current_feature.is_none(), "App should have no current feature initially");
}
