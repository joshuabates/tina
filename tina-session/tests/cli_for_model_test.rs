mod common;

use assert_cmd::prelude::*;
use common::tina_session_bin;
use predicates::prelude::*;
use std::process::Command;

#[test]
fn cli_for_model_opus_returns_claude() {
    Command::new(tina_session_bin())
        .args(["config", "cli-for-model", "--model", "opus"])
        .assert()
        .success()
        .stdout(predicate::str::contains("claude"));
}

#[test]
fn cli_for_model_gpt_returns_codex() {
    Command::new(tina_session_bin())
        .args(["config", "cli-for-model", "--model", "gpt-5.3-codex"])
        .assert()
        .success()
        .stdout(predicate::str::contains("codex"));
}

#[test]
fn cli_for_model_empty_string_fails() {
    Command::new(tina_session_bin())
        .args(["config", "cli-for-model", "--model", ""])
        .assert()
        .failure()
        .stderr(predicate::str::contains("must not be empty"));
}
