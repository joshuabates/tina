mod common;

use assert_cmd::prelude::*;
use common::tina_session_bin;
use predicates::prelude::*;
use std::fs;
use std::process::Command;
use tempfile::TempDir;

// Spec Commands

#[test]
fn spec_create_requires_fields() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "create"])
        .assert()
        .failure();
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn spec_create_with_markdown() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "create",
            "--project-id",
            "proj1",
            "--title",
            "Spec Title",
            "--markdown",
            "# Content",
        ])
        .assert()
        .success();
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn spec_create_with_markdown_file() {
    let temp_file = "/tmp/test-spec.md";
    fs::write(temp_file, "# Test Content").unwrap();

    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "create",
            "--project-id",
            "proj1",
            "--title",
            "Spec Title",
            "--markdown-file",
            temp_file,
        ])
        .assert()
        .success();

    let _ = fs::remove_file(temp_file);
}

#[test]
fn spec_get_requires_id_or_key() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "get"])
        .assert()
        .failure();
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn spec_get_with_id() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "get", "--id", "spec1"])
        .assert()
        .success();
}

#[test]
fn spec_list_requires_project_id() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "list"])
        .assert()
        .failure();
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn spec_list() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "list", "--project-id", "proj1"])
        .assert()
        .success();
}

#[test]
fn spec_update_requires_id() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "update"])
        .assert()
        .failure();
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn spec_update() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "update",
            "--id",
            "spec1",
            "--title",
            "New Title",
        ])
        .assert()
        .success();
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn spec_transition() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "transition",
            "--id",
            "spec1",
            "--status",
            "approved",
        ])
        .assert()
        .success();
}

#[test]
fn spec_resolve_requires_spec_id() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "resolve"])
        .assert()
        .failure();
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn spec_resolve() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "resolve", "--spec-id", "spec1"])
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
#[ignore = "requires live Convex PM functions and valid IDs"]
fn ticket_create() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "ticket",
            "create",
            "--project-id",
            "proj1",
            "--title",
            "Task",
            "--description",
            "Do something",
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
#[ignore = "requires live Convex PM functions and valid IDs"]
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
#[ignore = "requires live Convex PM functions and valid IDs"]
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
fn ticket_update_rejects_both_spec_link_options() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "ticket",
            "update",
            "--id",
            "ticket-123",
            "--spec-id",
            "spec-123",
            "--clear-spec-id",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "Cannot specify both --spec-id and --clear-spec-id",
        ));
}

#[test]
fn ticket_update_json_wraps_validation_error() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "ticket",
            "update",
            "--id",
            "ticket-123",
            "--spec-id",
            "spec-123",
            "--clear-spec-id",
            "--json",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("\"ok\":false"))
        .stderr(predicate::str::contains(
            "Cannot specify both --spec-id and --clear-spec-id",
        ));
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn ticket_update() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "ticket",
            "update",
            "--id",
            "ticket1",
            "--title",
            "New Title",
        ])
        .assert()
        .success();
}

#[test]
#[ignore = "requires live Convex PM functions and valid IDs"]
fn ticket_transition() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "ticket",
            "transition",
            "--id",
            "ticket1",
            "--status",
            "done",
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
#[ignore = "requires live Convex PM functions and valid IDs"]
fn comment_add() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "comment",
            "add",
            "--project-id",
            "proj1",
            "--target-type",
            "spec",
            "--target-id",
            "spec1",
            "--author-type",
            "human",
            "--author-name",
            "alice",
            "--body",
            "Comment text",
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
#[ignore = "requires live Convex PM functions and valid IDs"]
fn comment_list() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "comment",
            "list",
            "--target-type",
            "spec",
            "--target-id",
            "spec1",
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
        .stdout(predicate::str::contains("Spec management"))
        .stdout(predicate::str::contains("Ticket management"))
        .stdout(predicate::str::contains("Comment management"));
}

#[test]
fn spec_create_help_shows_arguments() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "create", "--help"])
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
fn ticket_update_help_shows_clear_spec_id() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "update", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("--clear-spec-id"))
        .stdout(predicate::str::contains("Clear spec link from ticket"));
}

#[test]
fn spec_create_rejects_both_markdown_sources() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let markdown_file = temp_dir.path().join("spec.md");
    fs::write(&markdown_file, "# Content").expect("Failed to write markdown file");

    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "create",
            "--project-id",
            "proj-123",
            "--title",
            "Test Spec",
            "--markdown",
            "# Inline",
            "--markdown-file",
            markdown_file.to_str().unwrap(),
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "Cannot specify both --markdown and --markdown-file",
        ));
}

#[test]
fn spec_create_requires_markdown_or_file() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "create",
            "--project-id",
            "proj-123",
            "--title",
            "Test Spec",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "Must specify either --markdown or --markdown-file",
        ));
}

#[test]
fn spec_update_rejects_both_markdown_sources() {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let markdown_file = temp_dir.path().join("spec.md");
    fs::write(&markdown_file, "# Content").expect("Failed to write markdown file");

    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "update",
            "--id",
            "spec-123",
            "--markdown",
            "# Inline",
            "--markdown-file",
            markdown_file.to_str().unwrap(),
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "Cannot specify both --markdown and --markdown-file",
        ));
}

#[test]
fn spec_get_rejects_both_id_and_key() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "get",
            "--id",
            "spec-123",
            "--key",
            "SPEC-1",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "Cannot specify both --id and --key",
        ));
}

#[test]
fn ticket_get_rejects_both_id_and_key() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "ticket",
            "get",
            "--id",
            "ticket-123",
            "--key",
            "TICKET-1",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "Cannot specify both --id and --key",
        ));
}

#[test]
fn spec_create_rejects_nonexistent_markdown_file() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "spec",
            "create",
            "--project-id",
            "proj-123",
            "--title",
            "Test Spec",
            "--markdown-file",
            "/nonexistent/path/to/file.md",
        ])
        .assert()
        .failure();
}

#[test]
fn spec_group_help_shows_subcommands() {
    Command::new(tina_session_bin())
        .args(["work", "spec", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Create a new spec"))
        .stdout(predicate::str::contains("Get a spec"));
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
