//! Run command implementation
//!
//! Executes a scenario end-to-end with mock or real orchestration.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result};

use crate::failure::{CategorizedFailure, FailureCategory};
use crate::scenario::{load_scenario, ExpectedState, FileAssertion, Scenario};

/// Result of running a scenario
#[derive(Debug)]
pub struct RunResult {
    /// Scenario that was run
    pub scenario_name: String,
    /// Whether the scenario passed
    pub passed: bool,
    /// List of failures (empty if passed)
    pub failures: Vec<CategorizedFailure>,
    /// Working directory used
    pub work_dir: PathBuf,
}

impl RunResult {
    fn success(scenario_name: String, work_dir: PathBuf) -> Self {
        Self {
            scenario_name,
            passed: true,
            failures: vec![],
            work_dir,
        }
    }

    fn failure(scenario_name: String, work_dir: PathBuf, failures: Vec<CategorizedFailure>) -> Self {
        Self {
            scenario_name,
            passed: false,
            failures,
            work_dir,
        }
    }
}

/// Configuration for the run command
pub struct RunConfig {
    /// Path to scenarios directory
    pub scenarios_dir: PathBuf,
    /// Path to test-project template
    pub test_project_dir: PathBuf,
    /// Working directory for scenario execution
    pub work_dir: PathBuf,
    /// Use full orchestration instead of mock
    pub full: bool,
    /// Force re-run even if baseline exists
    pub force_baseline: bool,
}

/// Run the command with the given config
pub fn run(scenario_name: &str, config: &RunConfig) -> Result<RunResult> {
    // Load scenario
    let scenario_dir = config.scenarios_dir.join(scenario_name);
    let scenario = load_scenario(&scenario_dir)
        .with_context(|| format!("Failed to load scenario: {}", scenario_name))?;

    // Create work directory
    let scenario_work_dir = config.work_dir.join(&scenario.name);
    if scenario_work_dir.exists() {
        fs::remove_dir_all(&scenario_work_dir)
            .with_context(|| format!("Failed to clean work directory: {}", scenario_work_dir.display()))?;
    }

    // Copy test-project to work directory
    copy_dir_recursive(&config.test_project_dir, &scenario_work_dir)
        .context("Failed to copy test-project")?;

    // Apply setup patch if present
    if let Some(ref patch) = scenario.setup_patch {
        if let Err(e) = apply_patch(&scenario_work_dir, patch) {
            return Ok(RunResult::failure(
                scenario.name.clone(),
                scenario_work_dir,
                vec![CategorizedFailure::patch_failed(e.to_string())],
            ));
        }
    }

    // Verify baseline compilation
    if let Err(e) = verify_compilation(&scenario_work_dir) {
        return Ok(RunResult::failure(
            scenario.name.clone(),
            scenario_work_dir,
            vec![CategorizedFailure::compilation_failed(e.to_string())],
        ));
    }

    // Check if tests should fail during setup
    let setup_tests_result = run_tests(&scenario_work_dir);
    if scenario.expected.assertions.setup_tests_failed {
        if setup_tests_result.is_ok() {
            return Ok(RunResult::failure(
                scenario.name.clone(),
                scenario_work_dir,
                vec![CategorizedFailure::new(
                    FailureCategory::Setup,
                    "Expected tests to fail during setup, but they passed",
                )],
            ));
        }
    } else if let Err(e) = setup_tests_result {
        return Ok(RunResult::failure(
            scenario.name.clone(),
            scenario_work_dir,
            vec![CategorizedFailure::new(
                FailureCategory::Setup,
                "Baseline tests failed before orchestration",
            )
            .with_details(e.to_string())],
        ));
    }

    // Run orchestration (mock or real)
    let state = if config.full {
        run_full_orchestration(&scenario_work_dir, &scenario)?
    } else {
        run_mock_orchestration(&scenario_work_dir, &scenario)?
    };

    // Validate results against expected state
    let failures = validate_outcome(&scenario_work_dir, &scenario.expected, &state);

    if failures.is_empty() {
        Ok(RunResult::success(scenario.name, scenario_work_dir))
    } else {
        Ok(RunResult::failure(scenario.name, scenario_work_dir, failures))
    }
}

/// Mock orchestration state (simulates what orchestration would produce)
#[derive(Debug)]
struct OrchestrationState {
    phases_completed: u32,
    status: String,
}

/// Run mock orchestration (simulates state without invoking real orchestration)
fn run_mock_orchestration(
    _work_dir: &Path,
    scenario: &Scenario,
) -> Result<OrchestrationState> {
    // Mock: just return the expected state so validation logic can be tested
    // In reality, this is where we'd invoke orchestration
    Ok(OrchestrationState {
        phases_completed: scenario.expected.assertions.phases_completed,
        status: scenario.expected.assertions.final_status.clone(),
    })
}

/// Run full orchestration (invokes actual orchestration)
fn run_full_orchestration(
    work_dir: &Path,
    scenario: &Scenario,
) -> Result<OrchestrationState> {
    // For Phase 3, just return an error indicating this isn't implemented
    // Full implementation deferred to Phase 4
    anyhow::bail!(
        "Full orchestration not yet implemented. Work dir: {}, Scenario: {}",
        work_dir.display(),
        scenario.name
    );
}

/// Validate the outcome against expected state
fn validate_outcome(
    work_dir: &Path,
    expected: &ExpectedState,
    state: &OrchestrationState,
) -> Vec<CategorizedFailure> {
    let mut failures = Vec::new();

    // Check phase count
    if state.phases_completed != expected.assertions.phases_completed {
        failures.push(CategorizedFailure::phase_count_mismatch(
            expected.assertions.phases_completed,
            state.phases_completed,
        ));
    }

    // Check final status
    if state.status != expected.assertions.final_status {
        failures.push(CategorizedFailure::status_mismatch(
            &expected.assertions.final_status,
            &state.status,
        ));
    }

    // Check tests pass (if required)
    if expected.assertions.tests_pass {
        if let Err(e) = run_tests(work_dir) {
            failures.push(CategorizedFailure::tests_failed(e.to_string()));
        }
    }

    // Check file assertions
    for file_assertion in &expected.assertions.file_changes {
        if let Some(failure) = check_file_assertion(work_dir, file_assertion) {
            failures.push(failure);
        }
    }

    failures
}

/// Check a single file assertion
fn check_file_assertion(work_dir: &Path, assertion: &FileAssertion) -> Option<CategorizedFailure> {
    let file_path = work_dir.join(&assertion.path);

    // Check existence
    if let Some(should_exist) = assertion.exists {
        let exists = file_path.exists();
        if should_exist && !exists {
            return Some(CategorizedFailure::file_not_found(&assertion.path));
        }
        if !should_exist && exists {
            return Some(CategorizedFailure::new(
                FailureCategory::Outcome,
                format!("File should not exist: {}", assertion.path),
            ));
        }
    }

    // Check content
    if let Some(ref expected_content) = assertion.contains {
        match fs::read_to_string(&file_path) {
            Ok(content) => {
                if !content.contains(expected_content) {
                    return Some(CategorizedFailure::content_not_found(
                        &assertion.path,
                        expected_content,
                    ));
                }
            }
            Err(_) => {
                return Some(CategorizedFailure::file_not_found(&assertion.path));
            }
        }
    }

    None
}

/// Copy a directory recursively
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        // Skip target directory
        if src_path.file_name().and_then(|s| s.to_str()) == Some("target") {
            continue;
        }

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

/// Apply a patch to the work directory
fn apply_patch(work_dir: &Path, patch: &str) -> Result<()> {
    // Write patch to temp file
    let patch_file = work_dir.join(".setup.patch");
    fs::write(&patch_file, patch)?;

    // Apply with git apply (more permissive) or patch command
    let output = Command::new("git")
        .args(["apply", "--ignore-whitespace", ".setup.patch"])
        .current_dir(work_dir)
        .output()
        .context("Failed to execute git apply")?;

    // Clean up patch file
    let _ = fs::remove_file(&patch_file);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("Patch failed: {}", stderr);
    }

    Ok(())
}

/// Verify the project compiles
fn verify_compilation(work_dir: &Path) -> Result<()> {
    let output = Command::new("cargo")
        .args(["build"])
        .current_dir(work_dir)
        .output()
        .context("Failed to execute cargo build")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("Compilation failed:\n{}", stderr);
    }

    Ok(())
}

/// Run tests in the work directory
fn run_tests(work_dir: &Path) -> Result<()> {
    let output = Command::new("cargo")
        .args(["test"])
        .current_dir(work_dir)
        .output()
        .context("Failed to execute cargo test")?;

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("Tests failed:\n{}\n{}", stdout, stderr);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_copy_dir_recursive() {
        let src = TempDir::new().unwrap();
        let dst = TempDir::new().unwrap();

        // Create source structure
        fs::write(src.path().join("file.txt"), "content").unwrap();
        fs::create_dir(src.path().join("subdir")).unwrap();
        fs::write(src.path().join("subdir/nested.txt"), "nested").unwrap();

        // Also create a target dir that should be skipped
        fs::create_dir(src.path().join("target")).unwrap();
        fs::write(src.path().join("target/skip.txt"), "skip").unwrap();

        // Copy
        let dst_path = dst.path().join("copy");
        copy_dir_recursive(src.path(), &dst_path).unwrap();

        // Verify
        assert!(dst_path.join("file.txt").exists());
        assert!(dst_path.join("subdir/nested.txt").exists());
        assert!(!dst_path.join("target").exists()); // Should be skipped
    }

    #[test]
    fn test_check_file_assertion_exists() {
        let temp = TempDir::new().unwrap();
        fs::write(temp.path().join("exists.txt"), "content").unwrap();

        // Should exist and does
        let assertion = FileAssertion {
            path: "exists.txt".to_string(),
            exists: Some(true),
            contains: None,
        };
        assert!(check_file_assertion(temp.path(), &assertion).is_none());

        // Should exist but doesn't
        let assertion = FileAssertion {
            path: "missing.txt".to_string(),
            exists: Some(true),
            contains: None,
        };
        let failure = check_file_assertion(temp.path(), &assertion);
        assert!(failure.is_some());
        assert_eq!(failure.unwrap().category, FailureCategory::Outcome);
    }

    #[test]
    fn test_check_file_assertion_contains() {
        let temp = TempDir::new().unwrap();
        fs::write(temp.path().join("test.txt"), "hello world").unwrap();

        // Contains expected content
        let assertion = FileAssertion {
            path: "test.txt".to_string(),
            exists: None,
            contains: Some("hello".to_string()),
        };
        assert!(check_file_assertion(temp.path(), &assertion).is_none());

        // Missing expected content
        let assertion = FileAssertion {
            path: "test.txt".to_string(),
            exists: None,
            contains: Some("goodbye".to_string()),
        };
        let failure = check_file_assertion(temp.path(), &assertion);
        assert!(failure.is_some());
    }

    #[test]
    fn test_validate_outcome_phase_mismatch() {
        let temp = TempDir::new().unwrap();
        let expected = ExpectedState {
            schema_version: 1,
            assertions: crate::scenario::Assertions {
                phases_completed: 3,
                final_status: "complete".to_string(),
                tests_pass: false,
                setup_tests_failed: false,
                file_changes: vec![],
            },
        };
        let state = OrchestrationState {
            phases_completed: 2,
            status: "complete".to_string(),
        };

        let failures = validate_outcome(temp.path(), &expected, &state);
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].category, FailureCategory::Outcome);
    }
}
