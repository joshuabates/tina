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

// ====================================================================
// task-edit CLI tests
// ====================================================================

#[test]
fn task_edit_rejects_missing_feature() {
    Command::new(tina_session_bin())
        .args(["orchestrate", "task-edit", "--phase", "1", "--task", "1", "--revision", "0"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--feature"));
}

#[test]
fn task_edit_rejects_missing_phase() {
    Command::new(tina_session_bin())
        .args(["orchestrate", "task-edit", "--feature", "test", "--task", "1", "--revision", "0"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--phase"));
}

#[test]
fn task_edit_rejects_missing_task() {
    Command::new(tina_session_bin())
        .args(["orchestrate", "task-edit", "--feature", "test", "--phase", "1", "--revision", "0"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--task"));
}

#[test]
fn task_edit_rejects_missing_revision() {
    Command::new(tina_session_bin())
        .args(["orchestrate", "task-edit", "--feature", "test", "--phase", "1", "--task", "1"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--revision"));
}

#[test]
fn task_edit_outputs_json_on_success() {
    let output = Command::new(tina_session_bin())
        .args([
            "orchestrate", "task-edit",
            "--feature", "test-feat",
            "--phase", "1",
            "--task", "3",
            "--revision", "2",
            "--subject", "New subject",
        ])
        .output()
        .expect("failed to run");
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout should be valid JSON");
    assert_eq!(json["success"], true);
    assert_eq!(json["action"], "task_edit");
    assert_eq!(json["feature"], "test-feat");
    assert_eq!(json["phase"], "1");
    assert_eq!(json["task_number"], 3);
    assert_eq!(json["revision"], 2);
    assert_eq!(json["subject"], "New subject");
    assert!(json["description"].is_null());
    assert!(json["model"].is_null());
}

// ====================================================================
// task-insert CLI tests
// ====================================================================

#[test]
fn task_insert_rejects_missing_feature() {
    Command::new(tina_session_bin())
        .args(["orchestrate", "task-insert", "--phase", "1", "--after-task", "0", "--subject", "s"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--feature"));
}

#[test]
fn task_insert_rejects_missing_subject() {
    Command::new(tina_session_bin())
        .args([
            "orchestrate", "task-insert",
            "--feature", "test",
            "--phase", "1",
            "--after-task", "0",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--subject"));
}

#[test]
fn task_insert_outputs_json_on_success() {
    let output = Command::new(tina_session_bin())
        .args([
            "orchestrate", "task-insert",
            "--feature", "test-feat",
            "--phase", "2",
            "--after-task", "1",
            "--subject", "New task",
            "--model", "haiku",
            "--depends-on", "1,2",
        ])
        .output()
        .expect("failed to run");
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout should be valid JSON");
    assert_eq!(json["success"], true);
    assert_eq!(json["action"], "task_insert");
    assert_eq!(json["feature"], "test-feat");
    assert_eq!(json["phase"], "2");
    assert_eq!(json["after_task"], 1);
    assert_eq!(json["subject"], "New task");
    assert_eq!(json["model"], "haiku");
    assert_eq!(json["depends_on"], "1,2");
}

// ====================================================================
// task-set-model CLI tests
// ====================================================================

#[test]
fn task_set_model_rejects_missing_feature() {
    Command::new(tina_session_bin())
        .args(["orchestrate", "task-set-model", "--phase", "1", "--task", "1", "--revision", "0", "--model", "opus"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--feature"));
}

#[test]
fn task_set_model_rejects_missing_model() {
    Command::new(tina_session_bin())
        .args([
            "orchestrate", "task-set-model",
            "--feature", "test",
            "--phase", "1",
            "--task", "1",
            "--revision", "0",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--model"));
}

#[test]
fn task_set_model_outputs_json_on_success() {
    let output = Command::new(tina_session_bin())
        .args([
            "orchestrate", "task-set-model",
            "--feature", "test-feat",
            "--phase", "1",
            "--task", "5",
            "--revision", "3",
            "--model", "sonnet",
        ])
        .output()
        .expect("failed to run");
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("stdout should be valid JSON");
    assert_eq!(json["success"], true);
    assert_eq!(json["action"], "task_set_model");
    assert_eq!(json["feature"], "test-feat");
    assert_eq!(json["phase"], "1");
    assert_eq!(json["task_number"], 5);
    assert_eq!(json["revision"], 3);
    assert_eq!(json["model"], "sonnet");
}
