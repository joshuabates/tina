use assert_cmd::prelude::*;
use predicates::prelude::*;
use std::fs;
use std::process::Command;

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
