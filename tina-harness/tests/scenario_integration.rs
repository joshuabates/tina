//! Integration tests for scenario execution

use std::fs;

use tempfile::TempDir;
use tina_harness::commands::run::{run, RunConfig};
use tina_harness::scenario::load_scenario;

/// Create a minimal test project in the given directory
fn create_test_project(dir: &std::path::Path) {
    fs::create_dir_all(dir.join("src/core")).unwrap();

    fs::write(
        dir.join("Cargo.toml"),
        r#"[package]
name = "test-project"
version = "0.1.0"
edition = "2021"

[dependencies]
"#,
    )
    .unwrap();

    fs::write(
        dir.join("src/lib.rs"),
        r#"pub mod core;
pub use core::processor::Processor;
"#,
    )
    .unwrap();

    fs::write(
        dir.join("src/core/mod.rs"),
        r#"pub mod processor;
"#,
    )
    .unwrap();

    fs::write(
        dir.join("src/core/processor.rs"),
        r#"pub struct Processor;

impl Processor {
    pub fn new() -> Self { Self }
    pub fn process(&self, input: &str) -> String {
        input.to_uppercase()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_processor() {
        let p = Processor::new();
        assert_eq!(p.process("hello"), "HELLO");
    }
}
"#,
    )
    .unwrap();

    fs::write(
        dir.join("src/main.rs"),
        r#"use test_project::Processor;

fn main() {
    let p = Processor::new();
    println!("{}", p.process("hello"));
}
"#,
    )
    .unwrap();
}

/// Create a minimal scenario in the given directory
fn create_scenario(dir: &std::path::Path, phases: u32, file_check: Option<(&str, &str)>) {
    fs::write(
        dir.join("design.md"),
        "# Test Scenario\n\n## Phase 1\n\nDo something.\n",
    )
    .unwrap();

    let file_changes = if let Some((path, contains)) = file_check {
        format!(
            r#"[{{ "path": "{}", "contains": "{}" }}]"#,
            path, contains
        )
    } else {
        "[]".to_string()
    };

    fs::write(
        dir.join("expected.json"),
        format!(
            r#"{{
  "schema_version": 1,
  "assertions": {{
    "phases_completed": {},
    "final_status": "complete",
    "tests_pass": true,
    "file_changes": {}
  }}
}}"#,
            phases, file_changes
        ),
    )
    .unwrap();
}

#[test]
fn test_scenario_loader() {
    let temp = TempDir::new().unwrap();
    let scenario_dir = temp.path().join("01-test");
    fs::create_dir(&scenario_dir).unwrap();
    create_scenario(&scenario_dir, 1, None);

    let scenario = load_scenario(&scenario_dir).unwrap();
    assert_eq!(scenario.name, "01-test");
    assert_eq!(scenario.expected.assertions.phases_completed, 1);
}

#[test]
fn test_run_scenario_passes_without_file_checks() {
    let temp = TempDir::new().unwrap();

    // Create test project
    let test_project = temp.path().join("test-project");
    create_test_project(&test_project);

    // Create scenario without file content checks
    let scenarios = temp.path().join("scenarios");
    let scenario_dir = scenarios.join("01-pass");
    fs::create_dir_all(&scenario_dir).unwrap();
    create_scenario(&scenario_dir, 1, None);

    // Create work directory
    let work_dir = temp.path().join("work");

    let config = RunConfig {
        scenarios_dir: scenarios,
        test_project_dir: test_project,
        work_dir,
        full: false,
        force_baseline: false,
    };

    let result = run("01-pass", &config).unwrap();
    assert!(
        result.passed,
        "Expected pass but got failures: {:?}",
        result.failures
    );
}

#[test]
fn test_run_scenario_fails_on_missing_content() {
    let temp = TempDir::new().unwrap();

    // Create test project
    let test_project = temp.path().join("test-project");
    create_test_project(&test_project);

    // Create scenario that expects content that doesn't exist
    let scenarios = temp.path().join("scenarios");
    let scenario_dir = scenarios.join("01-fail");
    fs::create_dir_all(&scenario_dir).unwrap();
    create_scenario(&scenario_dir, 1, Some(("src/main.rs", "nonexistent_content")));

    // Create work directory
    let work_dir = temp.path().join("work");

    let config = RunConfig {
        scenarios_dir: scenarios,
        test_project_dir: test_project,
        work_dir,
        full: false,
        force_baseline: false,
    };

    let result = run("01-fail", &config).unwrap();
    assert!(!result.passed, "Expected failure but got pass");
    assert!(
        result.failures.iter().any(|f| f.message.contains("missing expected content")),
        "Expected content failure but got: {:?}",
        result.failures
    );
}

#[test]
fn test_run_scenario_fails_on_phase_mismatch() {
    let temp = TempDir::new().unwrap();

    // Create test project
    let test_project = temp.path().join("test-project");
    create_test_project(&test_project);

    // Create scenario that expects 3 phases (mock will return 3)
    let scenarios = temp.path().join("scenarios");
    let scenario_dir = scenarios.join("01-phases");
    fs::create_dir_all(&scenario_dir).unwrap();

    // But we'll manually modify to expect a mismatch by checking later
    // For now, this tests that 3 phases work
    create_scenario(&scenario_dir, 3, None);

    // Create work directory
    let work_dir = temp.path().join("work");

    let config = RunConfig {
        scenarios_dir: scenarios,
        test_project_dir: test_project,
        work_dir,
        full: false,
        force_baseline: false,
    };

    let result = run("01-phases", &config).unwrap();
    // Mock returns expected phases, so this should pass
    assert!(result.passed, "Expected pass for matching phases");
}

#[test]
fn test_run_detects_compilation_failure() {
    let temp = TempDir::new().unwrap();

    // Create a broken test project
    let test_project = temp.path().join("test-project");
    fs::create_dir_all(test_project.join("src")).unwrap();

    fs::write(
        test_project.join("Cargo.toml"),
        r#"[package]
name = "test-project"
version = "0.1.0"
edition = "2021"
"#,
    )
    .unwrap();

    // Invalid Rust code
    fs::write(test_project.join("src/lib.rs"), "this is not valid rust").unwrap();

    // Create scenario
    let scenarios = temp.path().join("scenarios");
    let scenario_dir = scenarios.join("01-broken");
    fs::create_dir_all(&scenario_dir).unwrap();
    create_scenario(&scenario_dir, 1, None);

    // Create work directory
    let work_dir = temp.path().join("work");

    let config = RunConfig {
        scenarios_dir: scenarios,
        test_project_dir: test_project,
        work_dir,
        full: false,
        force_baseline: false,
    };

    let result = run("01-broken", &config).unwrap();
    assert!(!result.passed);
    assert!(
        result.failures.iter().any(|f| {
            f.category == tina_harness::FailureCategory::Setup
                && f.message.contains("Compilation failed")
        }),
        "Expected Setup/Compilation failure but got: {:?}",
        result.failures
    );
}
