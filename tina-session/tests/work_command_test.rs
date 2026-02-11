use assert_cmd::prelude::*;
use predicates::prelude::*;
use std::fs;
use std::process::Command;
use tempfile::TempDir;

fn tina_session_bin() -> std::path::PathBuf {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("target");
    path.push("debug");
    path.push("tina-session");
    path
}

// Design Commands

#[test]
fn design_create_requires_fields() {
    Command::new(tina_session_bin())
        .args(["work", "design", "create"])
        .assert()
        .failure();
}

#[test]
fn design_create_with_markdown() {
    Command::new(tina_session_bin())
        .args([
            "work", "design", "create",
            "--project-id", "proj1",
            "--title", "Design Title",
            "--markdown", "# Content",
        ])
        .assert()
        .success();
}

#[test]
fn design_create_with_markdown_file() {
    let temp_file = "/tmp/test-design.md";
    fs::write(temp_file, "# Test Content").unwrap();

    Command::new(tina_session_bin())
        .args([
            "work", "design", "create",
            "--project-id", "proj1",
            "--title", "Design Title",
            "--markdown-file", temp_file,
        ])
        .assert()
        .success();

    let _ = fs::remove_file(temp_file);
}

#[test]
fn design_get_requires_id_or_key() {
    Command::new(tina_session_bin())
        .args(["work", "design", "get"])
        .assert()
        .failure();
}

#[test]
fn design_get_with_id() {
    Command::new(tina_session_bin())
        .args(["work", "design", "get", "--id", "design1"])
        .assert()
        .success();
}

#[test]
fn design_list_requires_project_id() {
    Command::new(tina_session_bin())
        .args(["work", "design", "list"])
        .assert()
        .failure();
}

#[test]
fn design_list() {
    Command::new(tina_session_bin())
        .args(["work", "design", "list", "--project-id", "proj1"])
        .assert()
        .success();
}

#[test]
fn design_update_requires_id() {
    Command::new(tina_session_bin())
        .args(["work", "design", "update"])
        .assert()
        .failure();
}

#[test]
fn design_update() {
    Command::new(tina_session_bin())
        .args([
            "work", "design", "update",
            "--id", "design1",
            "--title", "New Title",
        ])
        .assert()
        .success();
}

#[test]
fn design_transition() {
    Command::new(tina_session_bin())
        .args([
            "work", "design", "transition",
            "--id", "design1",
            "--status", "approved",
        ])
        .assert()
        .success();
}

#[test]
fn design_resolve_requires_design_id() {
    Command::new(tina_session_bin())
        .args(["work", "design", "resolve"])
        .assert()
        .failure();
}

#[test]
fn design_resolve() {
    Command::new(tina_session_bin())
        .args(["work", "design", "resolve", "--design-id", "design1"])
        .assert()
        .success();
}

// Ticket Commands

#[test]
fn ticket_create_requires_fields() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "create"])
        .assert()
        .failure();
}

#[test]
fn ticket_create() {
    Command::new(tina_session_bin())
        .args([
            "work", "ticket", "create",
            "--project-id", "proj1",
            "--title", "Task",
            "--description", "Do something",
        ])
        .assert()
        .success();
}

#[test]
fn ticket_get_requires_id_or_key() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "get"])
        .assert()
        .failure();
}

#[test]
fn ticket_get_with_id() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "get", "--id", "ticket1"])
        .assert()
        .success();
}

#[test]
fn ticket_list_requires_project_id() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "list"])
        .assert()
        .failure();
}

#[test]
fn ticket_list() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "list", "--project-id", "proj1"])
        .assert()
        .success();
}

#[test]
fn ticket_update_requires_id() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "update"])
        .assert()
        .failure();
}

#[test]
fn ticket_update() {
    Command::new(tina_session_bin())
        .args([
            "work", "ticket", "update",
            "--id", "ticket1",
            "--title", "New Title",
        ])
        .assert()
        .success();
}

#[test]
fn ticket_transition() {
    Command::new(tina_session_bin())
        .args([
            "work", "ticket", "transition",
            "--id", "ticket1",
            "--status", "done",
        ])
        .assert()
        .success();
}

// Comment Commands

#[test]
fn comment_add_requires_fields() {
    Command::new(tina_session_bin())
        .args(["work", "comment", "add"])
        .assert()
        .failure();
}

#[test]
fn comment_add() {
    Command::new(tina_session_bin())
        .args([
            "work", "comment", "add",
            "--project-id", "proj1",
            "--target-type", "design",
            "--target-id", "design1",
            "--author-type", "human",
            "--author-name", "alice",
            "--body", "Comment text",
        ])
        .assert()
        .success();
}

#[test]
fn comment_list_requires_fields() {
    Command::new(tina_session_bin())
        .args(["work", "comment", "list"])
        .assert()
        .failure();
}

#[test]
fn comment_list() {
    Command::new(tina_session_bin())
        .args([
            "work", "comment", "list",
            "--target-type", "design",
            "--target-id", "design1",
        ])
        .assert()
        .success();
}

// Additional integration tests for help output and validation

#[test]
fn work_help_shows_subcommands() {
    Command::new(tina_session_bin())
        .args(["work", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Design management"))
        .stdout(predicate::str::contains("Ticket management"))
        .stdout(predicate::str::contains("Comment management"));
}

#[test]
fn design_create_help_shows_arguments() {
    Command::new(tina_session_bin())
        .args(["work", "design", "create", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("--project-id"))
        .stdout(predicate::str::contains("--title"))
        .stdout(predicate::str::contains("--markdown"))
        .stdout(predicate::str::contains("--markdown-file"))
        .stdout(predicate::str::contains("--json"));
}

#[test]
fn ticket_create_help_shows_default_priority() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "create", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("--priority"))
        .stdout(predicate::str::contains("default"))
        .stdout(predicate::str::contains("medium"));
}

#[test]
fn design_create_rejects_both_markdown_sources() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let markdown_file = temp_dir.path().join("design.md");
    fs::write(&markdown_file, "# Content").expect("Failed to write markdown file");

    Command::new(tina_session_bin())
        .args([
            "work", "design", "create",
            "--project-id", "proj-123",
            "--title", "Test Design",
            "--markdown", "# Inline",
            "--markdown-file", markdown_file.to_str().unwrap(),
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --markdown and --markdown-file"));
}

#[test]
fn design_create_requires_markdown_or_file() {
    Command::new(tina_session_bin())
        .args([
            "work", "design", "create",
            "--project-id", "proj-123",
            "--title", "Test Design",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Must specify either --markdown or --markdown-file"));
}

#[test]
fn design_update_rejects_both_markdown_sources() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let markdown_file = temp_dir.path().join("design.md");
    fs::write(&markdown_file, "# Content").expect("Failed to write markdown file");

    Command::new(tina_session_bin())
        .args([
            "work", "design", "update",
            "--id", "design-123",
            "--markdown", "# Inline",
            "--markdown-file", markdown_file.to_str().unwrap(),
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --markdown and --markdown-file"));
}

#[test]
fn design_get_rejects_both_id_and_key() {
    Command::new(tina_session_bin())
        .args([
            "work", "design", "get",
            "--id", "design-123",
            "--key", "DESIGN-1",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --id and --key"));
}

#[test]
fn ticket_get_rejects_both_id_and_key() {
    Command::new(tina_session_bin())
        .args([
            "work", "ticket", "get",
            "--id", "ticket-123",
            "--key", "TICKET-1",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --id and --key"));
}

#[test]
fn design_create_rejects_nonexistent_markdown_file() {
    Command::new(tina_session_bin())
        .args([
            "work", "design", "create",
            "--project-id", "proj-123",
            "--title", "Test Design",
            "--markdown-file", "/nonexistent/path/to/file.md",
        ])
        .assert()
        .failure();
}

#[test]
fn design_group_help_shows_subcommands() {
    Command::new(tina_session_bin())
        .args(["work", "design", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Create a new design"))
        .stdout(predicate::str::contains("Get a design"));
}

#[test]
fn ticket_group_help_shows_subcommands() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Create a new ticket"))
        .stdout(predicate::str::contains("Get a ticket"));
}

#[test]
fn comment_group_help_shows_subcommands() {
    Command::new(tina_session_bin())
        .args(["work", "comment", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Add a new comment"))
        .stdout(predicate::str::contains("List comments"));
}
