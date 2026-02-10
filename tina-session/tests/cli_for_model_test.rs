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
