//! TUI module integration tests

use ratatui::{backend::TestBackend, Terminal};
use std::path::PathBuf;
use std::time::Duration;
use tina_monitor::data::discovery::{Orchestration, OrchestrationStatus};
use tina_monitor::tui::{App, AppResult};

// ============================================================================
// Module Export Tests
// ============================================================================

/// Test that tui module exports are correct
#[test]
fn test_tui_module_exports() {
    // Verify App and AppResult are exported from tui
    // Just checking that the types exist and are accessible
    fn _takes_app_result(_: AppResult<()>) {}
    fn _takes_app(_: App) {}
}

/// Test that AppResult is compatible with standard error handling
#[test]
fn test_app_result_error_handling() {
    fn returns_ok() -> AppResult<i32> {
        Ok(42)
    }

    fn returns_err() -> AppResult<i32> {
        Err(std::io::Error::new(std::io::ErrorKind::Other, "test error").into())
    }

    assert_eq!(returns_ok().unwrap(), 42);
    assert!(returns_err().is_err());
}

/// Test that tui::run function exists and has correct signature
#[test]
fn test_run_function_exists() {
    // We can't actually run the TUI in tests (it needs a terminal),
    // but we can verify the function exists with the correct signature
    use tina_monitor::tui;

    // Type check: run() -> AppResult<()>
    let _: fn() -> tui::AppResult<()> = tui::run;
}

// ============================================================================
// Integration Tests: Empty State Handling
// ============================================================================

/// Test that TUI can handle empty orchestration list
#[test]
fn test_empty_state_renders() {
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let app = App::new_with_orchestrations(vec![]);

    // Render should succeed with empty orchestrations
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &app);
    });

    assert!(
        result.is_ok(),
        "TUI should render successfully with empty orchestration list"
    );

    // Verify the terminal buffer contains expected content
    let buffer = terminal.backend().buffer().clone();
    let content = buffer.content.iter().map(|c| c.symbol()).collect::<String>();
    assert!(
        content.contains("Orchestrations"),
        "Header should be rendered"
    );
    assert!(content.contains("j/k:nav"), "Footer should be rendered");
}

/// Test that empty state handles navigation gracefully
#[test]
fn test_empty_state_navigation() {
    let mut app = App::new_with_orchestrations(vec![]);

    // Navigation should not panic on empty list
    app.next();
    assert_eq!(app.selected_index, 0, "next() should not change index on empty list");

    app.previous();
    assert_eq!(
        app.selected_index, 0,
        "previous() should not change index on empty list"
    );
}

// ============================================================================
// Integration Tests: Single Orchestration Handling
// ============================================================================

fn make_test_orchestration(name: &str) -> Orchestration {
    Orchestration {
        team_name: format!("{}-team", name),
        title: name.to_string(),
        cwd: PathBuf::from("/test"),
        current_phase: 1,
        total_phases: 3,
        design_doc_path: PathBuf::from("/test/design.md"),
        context_percent: Some(50),
        status: OrchestrationStatus::Idle,
        tasks: vec![],
    }
}

/// Test that TUI can handle single orchestration
#[test]
fn test_single_orchestration_renders() {
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let app = App::new_with_orchestrations(vec![make_test_orchestration("test-project")]);

    // Render should succeed with single orchestration
    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &app);
    });

    assert!(
        result.is_ok(),
        "TUI should render successfully with single orchestration"
    );

    // Verify the terminal buffer contains orchestration content
    let buffer = terminal.backend().buffer().clone();
    let content = buffer.content.iter().map(|c| c.symbol()).collect::<String>();
    assert!(
        content.contains("test-project"),
        "Orchestration title should be rendered"
    );
}

/// Test that single orchestration handles navigation (wraps)
#[test]
fn test_single_orchestration_navigation_wraps() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("test-project")]);

    // next() should wrap around to 0
    app.next();
    assert_eq!(
        app.selected_index, 0,
        "next() should wrap to index 0 on single-item list"
    );

    // previous() should wrap around to 0
    app.previous();
    assert_eq!(
        app.selected_index, 0,
        "previous() should wrap to index 0 on single-item list"
    );
}

// ============================================================================
// Integration Tests: Navigation with Multiple Orchestrations
// ============================================================================

/// Test navigation works correctly with multiple orchestrations
#[test]
fn test_orchestration_list_navigation() {
    let mut app = App::new_with_orchestrations(vec![
        make_test_orchestration("project-1"),
        make_test_orchestration("project-2"),
        make_test_orchestration("project-3"),
    ]);

    // Start at 0
    assert_eq!(app.selected_index, 0);

    // Move down to 1
    app.next();
    assert_eq!(app.selected_index, 1);

    // Move down to 2
    app.next();
    assert_eq!(app.selected_index, 2);

    // Wrap around to 0
    app.next();
    assert_eq!(app.selected_index, 0);

    // Move up (wrap to 2)
    app.previous();
    assert_eq!(app.selected_index, 2);

    // Move up to 1
    app.previous();
    assert_eq!(app.selected_index, 1);
}

/// Test rendering with multiple orchestrations
#[test]
fn test_multiple_orchestrations_render() {
    let backend = TestBackend::new(100, 30);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new_with_orchestrations(vec![
        make_test_orchestration("project-alpha"),
        make_test_orchestration("project-beta"),
        make_test_orchestration("project-gamma"),
    ]);

    // Set selected index to middle item
    app.selected_index = 1;

    let result = terminal.draw(|frame| {
        tina_monitor::tui::ui::render(frame, &app);
    });

    assert!(
        result.is_ok(),
        "TUI should render successfully with multiple orchestrations"
    );

    // Verify all orchestrations are present in the buffer
    let buffer = terminal.backend().buffer().clone();
    let content = buffer.content.iter().map(|c| c.symbol()).collect::<String>();

    assert!(
        content.contains("project-alpha"),
        "First orchestration should be visible"
    );
    assert!(
        content.contains("project-beta"),
        "Second orchestration should be visible"
    );
    assert!(
        content.contains("project-gamma"),
        "Third orchestration should be visible"
    );
}

// ============================================================================
// Integration Tests: File Watcher
// ============================================================================

/// Test that FileWatcher can be created
#[test]
fn test_file_watcher_can_be_created() {
    use tina_monitor::data::watcher::FileWatcher;

    // FileWatcher::new() should either succeed or fail gracefully
    // (may fail if .claude dirs don't exist, which is OK)
    let result = FileWatcher::new();

    // We don't assert success because it depends on environment
    // But it should not panic
    match result {
        Ok(_watcher) => {
            // Success case
        }
        Err(e) => {
            // Failure is acceptable if directories don't exist
            println!("FileWatcher creation failed (acceptable): {}", e);
        }
    }
}

/// Test that App can be constructed without a watcher
#[test]
fn test_app_construction_without_watcher() {
    let app = App::new_with_orchestrations(vec![make_test_orchestration("test")]);

    // Verify app is constructed correctly
    assert_eq!(app.orchestrations.len(), 1);
    assert_eq!(app.selected_index, 0);
    assert!(!app.should_quit);
}

// ============================================================================
// Integration Tests: TUI Module Structure
// ============================================================================

/// Test that all TUI submodules are accessible
#[test]
fn test_tui_module_structure() {
    // Verify public exports from tui module
    use tina_monitor::tui::{App, AppResult};

    // AppResult should be usable
    fn _uses_app_result(_: &App) -> AppResult<()> {
        Ok(())
    }

    // App should be constructible
    let _app = App::new_with_orchestrations(vec![]);
}

/// Test that App can be constructed with various field values
#[test]
fn test_app_field_visibility() {
    // All public fields should be accessible for testing
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("test")]);

    // Modify public fields
    app.should_quit = true;
    app.selected_index = 5;
    app.tick_rate = Duration::from_millis(250);
    app.show_help = true;

    assert!(app.should_quit);
    assert_eq!(app.orchestrations.len(), 1);
    assert_eq!(app.selected_index, 5);
    assert_eq!(app.tick_rate, Duration::from_millis(250));
    assert!(app.show_help);
}
