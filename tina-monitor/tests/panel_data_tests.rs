use tina_monitor::app::App;
use std::path::PathBuf;

/// Helper function to get path to sample-orchestration fixture root
fn fixture_path() -> PathBuf {
    PathBuf::from("tests/fixtures/sample-orchestration")
}

#[test]
fn test_app_loads_orchestration_data() {
    let fixture = fixture_path();
    let mut app = App::with_fixture_path(Some(fixture));

    let result = app.load_orchestration("test-feature");
    match result {
        Ok(_) => {
            assert!(true, "Should successfully load test-feature orchestration");
        }
        Err(e) => {
            panic!("Failed to load orchestration: {}", e);
        }
    }
}

#[test]
fn test_dashboard_shows_feature_name() {
    let fixture = fixture_path();
    let mut app = App::with_fixture_path(Some(fixture));

    match app.load_orchestration("test-feature") {
        Ok(_) => {
            // Verify dashboard has the feature name set
            assert_eq!(app.dashboard.feature, "test-feature", "Dashboard should show feature name");
        }
        Err(e) => {
            panic!("Failed to load orchestration: {}", e);
        }
    }
}

#[test]
fn test_empty_orchestration_graceful() {
    let app = App::with_fixture_path(None);

    // Should have no data source but still be valid
    assert!(app.data_source.is_none(), "App with no fixture should have no data source");
    assert!(app.current_feature.is_none(), "App should have no current feature initially");
}
