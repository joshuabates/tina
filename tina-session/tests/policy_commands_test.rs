mod common;

use assert_cmd::prelude::*;
use common::tina_session_bin;
use predicates::prelude::*;
use std::process::Command;

// ====================================================================
// set-policy CLI tests
// ====================================================================

#[test]
fn set_policy_rejects_missing_feature() {
    Command::new(tina_session_bin())
        .args(["orchestrate", "set-policy"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--feature"));
}

#[test]
fn set_policy_rejects_no_json_args() {
    // Both --model-json and --review-json are omitted; the command should
    // reach our validation and bail with a helpful error.
    Command::new(tina_session_bin())
        .args([
            "orchestrate",
            "set-policy",
            "--feature",
            "nonexistent-feature",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains(
            "at least one of --model-json or --review-json is required",
        ));
}

// ====================================================================
// set-role-model CLI tests
// ====================================================================

#[test]
fn set_role_model_rejects_missing_feature() {
    Command::new(tina_session_bin())
        .args(["orchestrate", "set-role-model"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--feature"));
}

#[test]
fn set_role_model_rejects_missing_role() {
    Command::new(tina_session_bin())
        .args([
            "orchestrate",
            "set-role-model",
            "--feature",
            "test",
            "--model",
            "opus",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--role"));
}

#[test]
fn set_role_model_rejects_missing_model() {
    Command::new(tina_session_bin())
        .args([
            "orchestrate",
            "set-role-model",
            "--feature",
            "test",
            "--role",
            "executor",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--model"));
}

#[test]
fn set_role_model_rejects_invalid_role() {
    Command::new(tina_session_bin())
        .args([
            "orchestrate",
            "set-role-model",
            "--feature",
            "nonexistent-feature",
            "--role",
            "janitor",
            "--model",
            "opus",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("invalid role"));
}

#[test]
fn set_role_model_rejects_invalid_model() {
    Command::new(tina_session_bin())
        .args([
            "orchestrate",
            "set-role-model",
            "--feature",
            "nonexistent-feature",
            "--role",
            "executor",
            "--model",
            "gpt4",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("invalid model"));
}
