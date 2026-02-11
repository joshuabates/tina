use assert_cmd::prelude::*;
use predicates::prelude::*;
use std::process::Command;

fn tina_session_bin() -> std::path::PathBuf {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("target");
    path.push("debug");
    path.push("tina-session");
    path
}

#[test]
fn work_design_resolve_requires_id() {
    Command::new(tina_session_bin())
        .args(["work", "design", "resolve"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--id").or(predicate::str::contains("required")));
}

#[test]
fn work_design_resolve_with_id_parses() {
    Command::new(tina_session_bin())
        .args(["work", "design", "resolve", "--id", "test-id"])
        .assert()
        .success()
        .stderr(predicate::str::contains("design resolve not implemented"));
}

#[test]
fn work_design_resolve_json_flag_accepted() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "design",
            "resolve",
            "--id",
            "test-id",
            "--json",
        ])
        .assert()
        .success()
        .stderr(predicate::str::contains("design resolve not implemented"));
}

#[test]
fn work_design_create_markdown_file_flag_accepted() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "design",
            "create",
            "--markdown-file",
            "/tmp/test.md",
        ])
        .assert()
        .success()
        .stderr(predicate::str::contains("design create not implemented"));
}

#[test]
fn work_design_update_markdown_file_flag_accepted() {
    Command::new(tina_session_bin())
        .args([
            "work",
            "design",
            "update",
            "--id",
            "test-id",
            "--markdown-file",
            "/tmp/test.md",
        ])
        .assert()
        .success()
        .stderr(predicate::str::contains("design update not implemented"));
}

#[test]
fn work_ticket_command_accepted() {
    Command::new(tina_session_bin())
        .args(["work", "ticket", "list"])
        .assert()
        .success()
        .stderr(predicate::str::contains("ticket list not implemented"));
}

#[test]
fn work_comment_command_accepted() {
    Command::new(tina_session_bin())
        .args(["work", "comment", "list"])
        .assert()
        .success()
        .stderr(predicate::str::contains("comment list not implemented"));
}
