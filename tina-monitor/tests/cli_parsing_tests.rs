//! CLI parsing tests - verify all documented commands parse correctly

use std::process::Command;

/// Test that the CLI can be invoked with --help
#[test]
fn test_cli_help() {
    let output = Command::new("cargo")
        .args(["run", "--", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "CLI --help should succeed");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("tina-monitor"), "Help should mention tina-monitor");
    assert!(stdout.contains("status"), "Help should mention status command");
}

/// Test that `status team <name>` parses correctly
#[test]
fn test_cli_status_team_parse() {
    let output = Command::new("cargo")
        .args(["run", "--", "status", "team", "test-team", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    // Should not error on parse (may fail later because team doesn't exist)
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(!stderr.contains("error: unrecognized"), "Should parse status team command");
}

/// Test that `teams` command parses
#[test]
fn test_cli_teams_parse() {
    let output = Command::new("cargo")
        .args(["run", "--", "teams", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "teams --help should succeed");
}

/// Test that `tasks <team>` command parses
#[test]
fn test_cli_tasks_parse() {
    let output = Command::new("cargo")
        .args(["run", "--", "tasks", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "tasks --help should succeed");
}
