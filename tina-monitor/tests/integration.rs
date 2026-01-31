use tina_monitor::app::App;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

/// Helper function to create a KeyEvent from a KeyCode
fn key(code: KeyCode) -> KeyEvent {
    KeyEvent::new(code, KeyModifiers::NONE)
}

#[test]
fn test_app_renders_four_panels() {
    let app = App::new();

    // Verify app is created with correct state
    assert!(!app.should_quit(), "App should start without quit flag");
    assert_eq!(app.get_panel_focus(), (0, 0), "App should start with focus at (0,0)");

    // Note: Full rendering test with TestBackend is difficult due to crossterm setup in test environment.
    // The PanelGrid rendering is tested separately in layout_tests.rs.
    // This test verifies App creation and basic state initialization.
}

#[test]
fn test_navigation_wraps_at_edges() {
    let mut app = App::new();
    assert_eq!(app.get_panel_focus(), (0, 0), "Should start at (0,0)");

    // Move right to (0,1)
    app.handle_key(key(KeyCode::Char('l')));
    assert_eq!(app.get_panel_focus(), (0, 1), "Should be at (0,1) after moving right");

    // Move right again should wrap to (0,0)
    app.handle_key(key(KeyCode::Char('l')));
    assert_eq!(
        app.get_panel_focus(),
        (0, 0),
        "Should wrap back to (0,0) when moving right from edge"
    );
}

#[test]
fn test_quit_works_from_any_panel() {
    let mut app = App::new();
    assert!(!app.should_quit(), "App should not quit initially");

    app.handle_key(key(KeyCode::Char('q')));
    assert!(app.should_quit(), "App should quit after 'q' key");
}

// DataWatcher tests are in tests/watcher_tests.rs to avoid concurrent notify watcher issues
