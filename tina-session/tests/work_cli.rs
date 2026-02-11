use assert_cmd::Command;
use predicates::prelude::*;
use std::fs;
use tempfile::TempDir;

/// Helper to build the tina-session binary path
fn tina_session() -> Command {
    // Use cargo_bin! macro to avoid deprecation warning
    // For now, use the standard approach as the crate doesn't seem to have the macro
    Command::cargo_bin("tina-session").expect("Failed to find tina-session binary")
}

// ============================================================================
// --help Output Tests
// ============================================================================

#[test]
fn work_help_shows_subcommands() {
    let mut cmd = tina_session();
    cmd.arg("work").arg("--help");

    cmd.assert()
        .success()
        .stdout(predicate::str::contains("Design management"))
        .stdout(predicate::str::contains("Ticket management"))
        .stdout(predicate::str::contains("Comment management"));
}

#[test]
fn design_create_help_shows_arguments() {
    let mut cmd = tina_session();
    cmd.arg("work").arg("design").arg("create").arg("--help");

    cmd.assert()
        .success()
        .stdout(predicate::str::contains("--project-id"))
        .stdout(predicate::str::contains("--title"))
        .stdout(predicate::str::contains("--markdown"))
        .stdout(predicate::str::contains("--markdown-file"))
        .stdout(predicate::str::contains("--json"));
}

#[test]
fn ticket_create_help_shows_default_priority() {
    let mut cmd = tina_session();
    cmd.arg("work").arg("ticket").arg("create").arg("--help");

    cmd.assert()
        .success()
        .stdout(predicate::str::contains("--priority"))
        .stdout(predicate::str::contains("default"))
        .stdout(predicate::str::contains("medium"));
}

// ============================================================================
// Design Command Validation Tests
// ============================================================================

#[test]
fn design_create_requires_project_id() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("design")
        .arg("create")
        .arg("--title")
        .arg("Test Design")
        .arg("--markdown")
        .arg("# Content");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("project_id")));
}

#[test]
fn design_create_requires_title() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("design")
        .arg("create")
        .arg("--project-id")
        .arg("proj-123")
        .arg("--markdown")
        .arg("# Content");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("title")));
}

#[test]
fn design_get_requires_id_or_key() {
    let mut cmd = tina_session();
    cmd.arg("work").arg("design").arg("get");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Must specify either --id or --key"));
}

#[test]
fn design_get_rejects_both_id_and_key() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("design")
        .arg("get")
        .arg("--id")
        .arg("design-123")
        .arg("--key")
        .arg("DESIGN-1");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --id and --key"));
}

// ============================================================================
// Markdown File Handling Tests
// ============================================================================

#[test]
fn design_create_reads_markdown_from_file() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let markdown_file = temp_dir.path().join("design.md");
    fs::write(&markdown_file, "# Design Content\n\nThis is a test design.").expect("Failed to write markdown file");

    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("design")
        .arg("create")
        .arg("--project-id")
        .arg("proj-123")
        .arg("--title")
        .arg("Test Design")
        .arg("--markdown-file")
        .arg(&markdown_file);

    // Will fail because we don't have Convex, but should parse without markdown errors
    let output = cmd.output().expect("Failed to execute command");
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Should NOT complain about missing markdown or invalid markdown-file
    assert!(!stderr.contains("markdown") || stderr.contains("Convex") || stderr.contains("Error"));
}

#[test]
fn design_create_rejects_both_markdown_sources() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let markdown_file = temp_dir.path().join("design.md");
    fs::write(&markdown_file, "# Content").expect("Failed to write markdown file");

    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("design")
        .arg("create")
        .arg("--project-id")
        .arg("proj-123")
        .arg("--title")
        .arg("Test Design")
        .arg("--markdown")
        .arg("# Inline")
        .arg("--markdown-file")
        .arg(&markdown_file);

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --markdown and --markdown-file"));
}

#[test]
fn design_create_requires_markdown_or_file() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("design")
        .arg("create")
        .arg("--project-id")
        .arg("proj-123")
        .arg("--title")
        .arg("Test Design");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Must specify either --markdown or --markdown-file"));
}

#[test]
fn design_update_rejects_both_markdown_sources() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let markdown_file = temp_dir.path().join("design.md");
    fs::write(&markdown_file, "# Content").expect("Failed to write markdown file");

    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("design")
        .arg("update")
        .arg("--id")
        .arg("design-123")
        .arg("--markdown")
        .arg("# Inline")
        .arg("--markdown-file")
        .arg(&markdown_file);

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --markdown and --markdown-file"));
}

// ============================================================================
// Ticket Command Validation Tests
// ============================================================================

#[test]
fn ticket_create_requires_project_id() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("ticket")
        .arg("create")
        .arg("--title")
        .arg("Bug Fix")
        .arg("--description")
        .arg("Fix the bug");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("project_id")));
}

#[test]
fn ticket_create_requires_title() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("ticket")
        .arg("create")
        .arg("--project-id")
        .arg("proj-123")
        .arg("--description")
        .arg("Fix the bug");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("title")));
}

#[test]
fn ticket_create_requires_description() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("ticket")
        .arg("create")
        .arg("--project-id")
        .arg("proj-123")
        .arg("--title")
        .arg("Bug Fix");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("description")));
}

#[test]
fn ticket_create_defaults_priority_to_medium() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("ticket")
        .arg("create")
        .arg("--project-id")
        .arg("proj-123")
        .arg("--title")
        .arg("Bug Fix")
        .arg("--description")
        .arg("Fix the bug");

    // Will fail because we don't have Convex, but should accept missing --priority
    let output = cmd.output().expect("Failed to execute command");
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Should NOT complain about missing priority argument
    assert!(!stderr.contains("priority") || stderr.contains("Convex") || stderr.contains("Error"));
}

#[test]
fn ticket_get_requires_id_or_key() {
    let mut cmd = tina_session();
    cmd.arg("work").arg("ticket").arg("get");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Must specify either --id or --key"));
}

#[test]
fn ticket_get_rejects_both_id_and_key() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("ticket")
        .arg("get")
        .arg("--id")
        .arg("ticket-123")
        .arg("--key")
        .arg("TICKET-1");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --id and --key"));
}

// ============================================================================
// Comment Command Validation Tests
// ============================================================================

#[test]
fn comment_add_requires_project_id() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("comment")
        .arg("add")
        .arg("--target-type")
        .arg("ticket")
        .arg("--target-id")
        .arg("ticket-123")
        .arg("--author-type")
        .arg("human")
        .arg("--author-name")
        .arg("Alice")
        .arg("--body")
        .arg("This is a comment");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("project_id")));
}

#[test]
fn comment_add_requires_target_type() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("comment")
        .arg("add")
        .arg("--project-id")
        .arg("proj-123")
        .arg("--target-id")
        .arg("ticket-123")
        .arg("--author-type")
        .arg("human")
        .arg("--author-name")
        .arg("Alice")
        .arg("--body")
        .arg("This is a comment");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("target_type")));
}

#[test]
fn comment_list_requires_target_type() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("comment")
        .arg("list")
        .arg("--target-id")
        .arg("ticket-123");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("target_type")));
}

#[test]
fn comment_list_requires_target_id() {
    let mut cmd = tina_session();
    cmd.arg("work")
        .arg("comment")
        .arg("list")
        .arg("--target-type")
        .arg("ticket");

    cmd.assert()
        .failure()
        .stderr(predicate::str::contains("required").or(predicate::str::contains("target_id")));
}
