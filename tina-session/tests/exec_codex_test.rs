mod common;

use assert_cmd::prelude::*;
use common::tina_session_bin;
use predicates::prelude::*;
use std::process::Command;
use tempfile::TempDir;

#[test]
fn exec_codex_rejects_claude_model() {
    // "opus" routes to claude, not codex - should fail.
    let dir = TempDir::new().unwrap();
    Command::new(tina_session_bin())
        .args([
            "exec-codex",
            "--feature",
            "test-feature",
            "--phase",
            "1",
            "--task-id",
            "test-task",
            "--prompt",
            "hello",
            "--cwd",
            dir.path().to_str().unwrap(),
            "--model",
            "opus",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("routes to claude"));
}

#[test]
fn exec_codex_rejects_empty_model() {
    let dir = TempDir::new().unwrap();
    Command::new(tina_session_bin())
        .args([
            "exec-codex",
            "--feature",
            "test-feature",
            "--phase",
            "1",
            "--task-id",
            "test-task",
            "--prompt",
            "hello",
            "--cwd",
            dir.path().to_str().unwrap(),
            "--model",
            "",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("does not route to codex"));
}
