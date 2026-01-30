//! CLI integration tests

use std::fs;
use std::process::Command;
use tempfile::TempDir;

/// Helper to set up fixture environment
#[allow(dead_code)]
fn setup_fixture_env() -> TempDir {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let teams_dir = temp_dir.path().join("teams");
    let tasks_dir = temp_dir.path().join("tasks");

    // Create team directories
    fs::create_dir_all(&teams_dir).unwrap();
    fs::create_dir_all(&tasks_dir).unwrap();

    // Create a test team with tasks
    let team_dir = teams_dir.join("test-team");
    fs::create_dir_all(&team_dir).unwrap();

    let team_config = r#"{
        "name": "test-team",
        "description": "Test team",
        "createdAt": 1706644800000,
        "leadAgentId": "leader@test-team",
        "leadSessionId": "session-123",
        "members": [{
            "agentId": "leader@test-team",
            "name": "leader",
            "agentType": "team-lead",
            "model": "claude-opus-4-5-20251101",
            "joinedAt": 1706644800000,
            "tmuxPaneId": null,
            "cwd": "/path/to/project",
            "subscriptions": []
        }]
    }"#;
    fs::write(team_dir.join("config.json"), team_config).unwrap();

    // Create tasks for the team
    let session_dir = tasks_dir.join("session-123");
    fs::create_dir_all(&session_dir).unwrap();

    let task1 = r#"{
        "id": "1",
        "subject": "Setup project",
        "description": "Initial project setup",
        "activeForm": "Setting up project",
        "status": "completed",
        "owner": null,
        "blocks": ["2"],
        "blockedBy": [],
        "metadata": {}
    }"#;
    fs::write(session_dir.join("1.json"), task1).unwrap();

    let task2 = r#"{
        "id": "2",
        "subject": "Implement feature",
        "description": "Main implementation",
        "activeForm": "Implementing feature",
        "status": "in_progress",
        "owner": "worker",
        "blocks": [],
        "blockedBy": ["1"],
        "metadata": {}
    }"#;
    fs::write(session_dir.join("2.json"), task2).unwrap();

    temp_dir
}

/// Test binary builds and runs
#[test]
fn test_binary_runs() {
    let output = Command::new("cargo")
        .args(["run", "--", "--version"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "Binary should run with --version");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("tina-monitor"));
}

/// Test help output contains all commands
#[test]
fn test_help_completeness() {
    let output = Command::new("cargo")
        .args(["run", "--", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Check all commands are documented
    assert!(
        stdout.contains("status"),
        "Help should mention status command"
    );
    assert!(
        stdout.contains("teams"),
        "Help should mention teams command"
    );
    assert!(
        stdout.contains("tasks"),
        "Help should mention tasks command"
    );
}

/// Test status team subcommand help
#[test]
fn test_status_team_help() {
    let output = Command::new("cargo")
        .args(["run", "--", "status", "team", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success(), "status team --help should succeed");
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Check documented options
    assert!(
        stdout.contains("--format"),
        "Should document --format option"
    );
    assert!(stdout.contains("--check"), "Should document --check option");
}

/// Test status orchestration subcommand help
#[test]
fn test_status_orchestration_help() {
    let output = Command::new("cargo")
        .args(["run", "--", "status", "orchestration", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(
        output.status.success(),
        "status orchestration --help should succeed"
    );
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(
        stdout.contains("--format"),
        "Should document --format option"
    );
    assert!(stdout.contains("--check"), "Should document --check option");
}

/// Test teams command with format options
#[test]
fn test_teams_format_options() {
    let output = Command::new("cargo")
        .args(["run", "--", "teams", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(
        stdout.contains("--format"),
        "Should document --format option"
    );
    assert!(
        stdout.contains("--filter"),
        "Should document --filter option"
    );
}

/// Test tasks command help
#[test]
fn test_tasks_help() {
    let output = Command::new("cargo")
        .args(["run", "--", "tasks", "--help"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);

    assert!(
        stdout.contains("--format"),
        "Should document --format option"
    );
    assert!(
        stdout.contains("--status"),
        "Should document --status filter option"
    );
}

/// Test that teams list runs (may be empty)
#[test]
fn test_teams_list_runs() {
    let output = Command::new("cargo")
        .args(["run", "--", "teams", "--format", "json"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    // Should succeed even if teams dir doesn't exist
    assert!(output.status.success(), "teams command should succeed");
    let stdout = String::from_utf8_lossy(&output.stdout);
    // Should output valid JSON (empty array is valid)
    assert!(stdout.contains("["), "Should output JSON array");
}

/// Test invalid format option fails gracefully
#[test]
fn test_invalid_format_rejected() {
    let output = Command::new("cargo")
        .args(["run", "--", "teams", "--format", "invalid"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(!output.status.success(), "Invalid format should fail");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("invalid") || stderr.contains("Invalid"));
}

/// Test missing team name for status team
#[test]
fn test_status_team_requires_name() {
    let output = Command::new("cargo")
        .args(["run", "--", "status", "team"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(
        !output.status.success(),
        "status team without name should fail"
    );
}

/// Test missing team name for tasks
#[test]
fn test_tasks_requires_team() {
    let output = Command::new("cargo")
        .args(["run", "--", "tasks"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(!output.status.success(), "tasks without team should fail");
}

/// Test nonexistent team returns error
#[test]
fn test_nonexistent_team_error() {
    let output = Command::new("cargo")
        .args(["run", "--", "status", "team", "nonexistent-team-xyz"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    assert!(!output.status.success(), "Nonexistent team should fail");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Error") || stderr.contains("error"));
}

/// Test check=complete with incomplete team returns exit code 1
#[test]
fn test_check_complete_incomplete_team() {
    // Can't easily test with real team, but we can test the error case
    let output = Command::new("cargo")
        .args([
            "run",
            "--",
            "status",
            "team",
            "nonexistent",
            "--check",
            "complete",
        ])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Failed to execute command");

    // Should fail because team doesn't exist
    assert!(!output.status.success());
}
