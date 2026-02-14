mod common;

use assert_cmd::prelude::*;
use common::tina_session_bin;
use predicates::prelude::*;
use std::process::Command;
use tempfile::TempDir;

#[test]
fn init_rejects_both_spec_doc_and_spec_id() {
    let temp_dir = TempDir::new().unwrap();
    let cwd = temp_dir.path();

    Command::new(tina_session_bin())
        .args([
            "init",
            "--feature",
            "test-both-flags",
            "--cwd",
            &cwd.to_string_lossy(),
            "--spec-doc",
            "/tmp/nonexistent.md",
            "--spec-id",
            "some-id",
            "--branch",
            "tina/test",
            "--total-phases",
            "1",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "Cannot specify both --spec-doc and --spec-id",
        ));
}

#[test]
fn init_rejects_neither_spec_doc_nor_spec_id() {
    let temp_dir = TempDir::new().unwrap();
    let cwd = temp_dir.path();

    Command::new(tina_session_bin())
        .args([
            "init",
            "--feature",
            "test-no-flags",
            "--cwd",
            &cwd.to_string_lossy(),
            "--branch",
            "tina/test",
            "--total-phases",
            "1",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "Must specify either --spec-doc or --spec-id",
        ));
}
