//! Tests for command logging

use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;
use tina_monitor::logging::CommandLogger;

#[test]
fn test_log_creates_file_if_not_exists() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let log_path = temp_dir.path().join("commands.log");

    let logger = CommandLogger::new(log_path.clone());
    logger
        .log("test-pane", "echo hello")
        .expect("Failed to log command");

    assert!(log_path.exists(), "Log file should be created");
}

#[test]
fn test_log_appends_to_existing_file() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let log_path = temp_dir.path().join("commands.log");

    // Create initial log entry
    let logger = CommandLogger::new(log_path.clone());
    logger
        .log("pane-1", "first command")
        .expect("Failed to log first command");

    // Append second log entry
    logger
        .log("pane-2", "second command")
        .expect("Failed to log second command");

    let content = fs::read_to_string(&log_path).expect("Failed to read log file");
    assert!(
        content.contains("first command"),
        "First command should be in log"
    );
    assert!(
        content.contains("second command"),
        "Second command should be in log"
    );
}

#[test]
fn test_log_includes_timestamp_target_command() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let log_path = temp_dir.path().join("commands.log");

    let logger = CommandLogger::new(log_path.clone());
    logger
        .log("test-pane", "test command")
        .expect("Failed to log command");

    let content = fs::read_to_string(&log_path).expect("Failed to read log file");

    // Log entry should include timestamp (ISO 8601 format with 'T')
    assert!(content.contains("T"), "Log should contain timestamp");
    // RFC 3339 format uses either 'Z' or '+00:00' for UTC
    assert!(
        content.contains("Z") || content.contains("+00:00"),
        "Timestamp should be in UTC format"
    );

    // Should include target pane
    assert!(
        content.contains("test-pane"),
        "Log should contain target pane"
    );

    // Should include command
    assert!(
        content.contains("test command"),
        "Log should contain command text"
    );
}

#[test]
fn test_expand_path_handles_tilde() {
    let _temp_dir = TempDir::new().expect("Failed to create temp dir");

    // Create a path with ~ that we'll expand
    let path_with_tilde = PathBuf::from("~/test.log");

    // Create logger and verify it can handle paths with ~
    // We don't test the actual expansion here, just that it doesn't panic
    let logger = CommandLogger::new(path_with_tilde);

    // Log something to ensure the expanded path works
    // Note: This will expand to actual home directory, so we just verify no panic
    let result = logger.log("test-pane", "test");

    // We expect this to succeed (expanded path should be writable in home dir)
    // If home directory is not writable, the test will fail, which is acceptable
    assert!(
        result.is_ok(),
        "Should handle tilde expansion without error"
    );
}
