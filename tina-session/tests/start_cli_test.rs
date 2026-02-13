mod common;

use assert_cmd::prelude::*;
use common::tina_session_bin;
use predicates::prelude::*;
use std::process::Command;

#[test]
fn start_requires_plan_or_design_id() {
    Command::new(tina_session_bin())
        .args(["start", "--feature", "test", "--phase", "1"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("--plan").and(predicate::str::contains("--design-id")));
}

#[test]
fn start_rejects_plan_and_design_id_together() {
    Command::new(tina_session_bin())
        .args([
            "start",
            "--feature",
            "test",
            "--phase",
            "1",
            "--plan",
            "docs/plans/example.md",
            "--design-id",
            "design_123",
        ])
        .assert()
        .failure()
        .stderr(predicate::str::contains("cannot be used with"));
}
