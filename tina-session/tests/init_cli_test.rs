use assert_cmd::prelude::*;
use predicates::prelude::*;
use std::process::Command;
use tempfile::TempDir;

fn tina_session_bin() -> std::path::PathBuf {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("target");
    path.push("debug");
    path.push("tina-session");
    path
}

#[test]
fn init_rejects_both_design_doc_and_design_id() {
    let temp_dir = TempDir::new().unwrap();
    let cwd = temp_dir.path();

    Command::new(tina_session_bin())
        .args([
            "init",
            "--feature", "test-both-flags",
            "--cwd", &cwd.to_string_lossy(),
            "--design-doc", "/tmp/nonexistent.md",
            "--design-id", "some-id",
            "--branch", "tina/test",
            "--total-phases", "1",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Cannot specify both --design-doc and --design-id"));
}

#[test]
fn init_rejects_neither_design_doc_nor_design_id() {
    let temp_dir = TempDir::new().unwrap();
    let cwd = temp_dir.path();

    Command::new(tina_session_bin())
        .args([
            "init",
            "--feature", "test-no-flags",
            "--cwd", &cwd.to_string_lossy(),
            "--branch", "tina/test",
            "--total-phases", "1",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("Must specify either --design-doc or --design-id"));
}
