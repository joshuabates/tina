//! TUI module tests

/// Test that tui module exports are correct
#[test]
fn test_tui_module_exports() {
    // Verify App and AppResult are exported from tui
    use tina_monitor::tui::{App, AppResult};

    // Just checking that the types exist and are accessible
    fn _takes_app_result(_: AppResult<()>) {}
    fn _takes_app(_: App) {}
}

/// Test that AppResult is compatible with standard error handling
#[test]
fn test_app_result_error_handling() {
    use tina_monitor::tui::AppResult;

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
