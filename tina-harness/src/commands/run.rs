//! Run command implementation
//!
//! Executes a scenario end-to-end with mock or real orchestration.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};

use crate::failure::{CategorizedFailure, FailureCategory};
use crate::scenario::{
    load_last_passed, load_scenario, save_last_passed, ExpectedState, FileAssertion, Scenario,
};

/// Result of running a scenario
#[derive(Debug)]
pub struct RunResult {
    /// Scenario that was run
    pub scenario_name: String,
    /// Derived feature name used in Convex (may differ from scenario_name)
    pub feature_name: String,
    /// Whether the scenario passed
    pub passed: bool,
    /// List of failures (empty if passed)
    pub failures: Vec<CategorizedFailure>,
    /// Working directory used
    pub work_dir: PathBuf,
    /// Whether the scenario was skipped due to baseline
    pub skipped: bool,
}

impl RunResult {
    fn success(scenario_name: String, work_dir: PathBuf) -> Self {
        let feature_name = derive_feature_name(&scenario_name);
        Self {
            scenario_name,
            feature_name,
            passed: true,
            failures: vec![],
            work_dir,
            skipped: false,
        }
    }

    fn failure(scenario_name: String, work_dir: PathBuf, failures: Vec<CategorizedFailure>) -> Self {
        let feature_name = derive_feature_name(&scenario_name);
        Self {
            scenario_name,
            feature_name,
            passed: false,
            failures,
            work_dir,
            skipped: false,
        }
    }

    fn skipped(scenario_name: String, work_dir: PathBuf) -> Self {
        let feature_name = derive_feature_name(&scenario_name);
        Self {
            scenario_name,
            feature_name,
            passed: true,
            failures: vec![],
            work_dir,
            skipped: true,
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

    // Check baseline skip logic (unless --force-baseline)
    if !config.force_baseline {
        if let Some(skip_reason) = should_skip_baseline(&scenario_dir)? {
            eprintln!("Skipping {}: {}", scenario_name, skip_reason);
            return Ok(RunResult::skipped(scenario.name, scenario_work_dir));
        }
    }

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
        // Save last-passed state on success
        if let Ok(hash) = get_current_git_hash() {
            let _ = save_last_passed(&scenario_dir, &hash);
        }
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

/// Maximum time to wait for orchestration to complete (45 minutes).
const ORCHESTRATION_TIMEOUT_SECS: u64 = 45 * 60;

/// Time to wait for Claude TUI to be ready (seconds).
const CLAUDE_READY_TIMEOUT_SECS: u64 = 60;

/// How often to poll the supervisor state for completion (seconds).
const POLL_INTERVAL_SECS: u64 = 10;

/// Run full orchestration via tmux-based interactive Claude session.
///
/// Creates a detached tmux session, launches Claude in interactive mode,
/// sends the orchestrate skill command, and waits for completion by polling
/// the supervisor state in Convex.
fn run_full_orchestration(
    work_dir: &Path,
    scenario: &Scenario,
) -> Result<OrchestrationState> {
    // Derive a feature name the orchestrate skill will likely use.
    // The skill extracts it from the design doc filename or content.
    // We use a simple heuristic matching the scenario name pattern.
    let feature_name = derive_feature_name(&scenario.name);
    eprintln!("Derived feature name: {}", feature_name);

    // Clean up stale state from previous runs
    cleanup_stale_state(&feature_name);

    // Write the design doc to the work directory
    let design_path = work_dir.join("design.md");
    fs::write(&design_path, &scenario.design_doc)
        .context("Failed to write design doc to work directory")?;

    // Initialize git repo in work directory (required for orchestration)
    let git_init = Command::new("git")
        .args(["init"])
        .current_dir(work_dir)
        .output()
        .context("Failed to initialize git repo")?;

    if !git_init.status.success() {
        anyhow::bail!(
            "Failed to initialize git repo: {}",
            String::from_utf8_lossy(&git_init.stderr)
        );
    }

    // Make initial commit
    let _ = Command::new("git")
        .args(["add", "."])
        .current_dir(work_dir)
        .output();

    let _ = Command::new("git")
        .args(["commit", "-m", "Initial commit"])
        .current_dir(work_dir)
        .output();

    let session_name = format!("tina-harness-{}", scenario.name);

    // Kill any existing session with this name
    let _ = tina_session::tmux::kill_session(&session_name);

    // Create detached tmux session with work_dir as cwd
    eprintln!("Creating tmux session '{}' in {}", session_name, work_dir.display());
    tina_session::tmux::create_session(&session_name, work_dir, None)
        .map_err(|e| anyhow::anyhow!("Failed to create tmux session: {}", e))?;

    // Small delay to let shell initialize
    std::thread::sleep(Duration::from_millis(500));

    // Launch Claude in interactive mode with permissions bypass
    let claude_bin = detect_claude_binary();
    let claude_cmd = format!("{} --dangerously-skip-permissions", claude_bin);
    eprintln!("Starting Claude ({}) in session...", claude_bin);
    tina_session::tmux::send_keys(&session_name, &claude_cmd)
        .map_err(|e| anyhow::anyhow!("Failed to send claude command: {}", e))?;

    // Wait for Claude to be ready
    eprintln!("Waiting for Claude to be ready (up to {}s)...", CLAUDE_READY_TIMEOUT_SECS);
    match tina_session::claude::wait_for_ready(&session_name, CLAUDE_READY_TIMEOUT_SECS) {
        Ok(_) => eprintln!("Claude is ready."),
        Err(e) => {
            eprintln!("Warning: Claude may not be ready: {}", e);
            eprintln!("Proceeding anyway...");
        }
    }

    // Let TUI settle before sending commands
    std::thread::sleep(Duration::from_secs(2));

    // Send the orchestrate skill command
    let skill_cmd = format!("/tina:orchestrate {}", design_path.display());
    eprintln!("Sending: {}", skill_cmd);
    tina_session::tmux::send_keys(&session_name, &skill_cmd)
        .map_err(|e| anyhow::anyhow!("Failed to send orchestrate command: {}", e))?;

    // Wait for orchestration to complete by polling Convex supervisor state
    eprintln!("Waiting for orchestration to complete (timeout: {}s)...", ORCHESTRATION_TIMEOUT_SECS);
    let result = wait_for_orchestration_complete(
        &feature_name,
        &session_name,
        ORCHESTRATION_TIMEOUT_SECS,
    );

    // Always clean up the tmux session
    eprintln!("Cleaning up tmux session '{}'", session_name);
    let _ = tina_session::tmux::kill_session(&session_name);

    result
}

/// Detect which claude binary is available and functional.
/// Uses 'claude' (release) and verifies it runs.
fn detect_claude_binary() -> &'static str {
    if Command::new("claude")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return "claude";
    }

    // Default to claude and let it fail with a clear error
    "claude"
}

/// Derive a feature name from a scenario name.
/// Maps scenario names like "01-single-phase-feature" to likely orchestration
/// feature names like "verbose-flag" by reading the design doc title.
fn derive_feature_name(scenario_name: &str) -> String {
    // The orchestrate skill typically derives feature name from the design content.
    // For our known scenarios, we hardcode the mapping. A more robust approach
    // would parse the design doc, but this works for the test scenarios.
    match scenario_name {
        "01-single-phase-feature" => "verbose-flag".to_string(),
        "02-two-phase-refactor" => "utility-refactor".to_string(),
        "03-failing-tests" => "fix-blank-check".to_string(),
        _ => scenario_name.replace(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-'], ""),
    }
}

/// Clean up stale state from a previous orchestration run for this feature.
fn cleanup_stale_state(feature_name: &str) {
    let home = dirs::home_dir().expect("could not determine home directory");

    // Remove session lookup
    let session_file = home
        .join(".claude")
        .join("tina-sessions")
        .join(format!("{}.json", feature_name));
    if session_file.exists() {
        eprintln!("Removing stale session lookup: {}", session_file.display());
        let _ = fs::remove_file(&session_file);
    }

    // Remove team directory
    let team_dir = home
        .join(".claude")
        .join("teams")
        .join(format!("{}-orchestration", feature_name));
    if team_dir.exists() {
        eprintln!("Removing stale team dir: {}", team_dir.display());
        let _ = fs::remove_dir_all(&team_dir);
    }

    // Remove tasks directory
    let tasks_dir = home
        .join(".claude")
        .join("tasks")
        .join(format!("{}-orchestration", feature_name));
    if tasks_dir.exists() {
        eprintln!("Removing stale tasks dir: {}", tasks_dir.display());
        let _ = fs::remove_dir_all(&tasks_dir);
    }

    // Kill any stale tmux sessions
    let session_name = format!("tina-harness-{}", feature_name);
    let _ = tina_session::tmux::kill_session(&session_name);
}

/// Wait for orchestration to complete by polling Convex.
///
/// Checks the supervisor state periodically until:
/// - Status is "complete" or "blocked" → returns OrchestrationState
/// - Timeout expires → returns error
/// - tmux session dies → returns error
fn wait_for_orchestration_complete(
    feature_name: &str,
    session_name: &str,
    timeout_secs: u64,
) -> Result<OrchestrationState> {
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);
    let poll_interval = Duration::from_secs(POLL_INTERVAL_SECS);

    loop {
        if start.elapsed() > timeout {
            anyhow::bail!(
                "Orchestration timed out after {}s for feature '{}'",
                timeout_secs,
                feature_name
            );
        }

        // Check tmux session health
        if !tina_session::tmux::session_exists(session_name) {
            // Session died — try to read final state from Convex anyway
            eprintln!("Warning: tmux session '{}' disappeared", session_name);
            return load_orchestration_state_from_convex(feature_name);
        }

        // Try to load state from Convex
        match load_orchestration_state_from_convex(feature_name) {
            Ok(state) => {
                if state.status == "complete" || state.status == "blocked" {
                    eprintln!(
                        "Orchestration finished: status={}, phases={}",
                        state.status, state.phases_completed
                    );
                    return Ok(state);
                }
                // Still running, report progress
                let elapsed = start.elapsed().as_secs();
                eprintln!(
                    "[{}s] status={}, phases_completed={}",
                    elapsed, state.status, state.phases_completed
                );
            }
            Err(e) => {
                // State not available yet (orchestration hasn't written to Convex)
                let elapsed = start.elapsed().as_secs();
                if elapsed % 30 == 0 && elapsed > 0 {
                    eprintln!("[{}s] Waiting for orchestration state: {}", elapsed, e);
                }
            }
        }

        std::thread::sleep(poll_interval);
    }
}

/// Load orchestration state from Convex for a given feature name.
///
/// Uses `listOrchestrations` via TinaConvexClient to find the most recent
/// orchestration matching the feature name, avoiding node_id mismatch issues.
fn load_orchestration_state_from_convex(feature_name: &str) -> Result<OrchestrationState> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let cfg = tina_session::config::load_config()?;
        let convex_url = cfg
            .convex_url
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow::anyhow!("convex_url not set in config"))?;

        let mut client = tina_data::TinaConvexClient::new(&convex_url).await?;
        let orchestrations = client.list_orchestrations().await?;

        // Find the most recent orchestration for this feature
        let entry = orchestrations
            .iter()
            .filter(|o| o.record.feature_name == feature_name)
            .max_by(|a, b| a.record.started_at.cmp(&b.record.started_at))
            .ok_or_else(|| {
                anyhow::anyhow!("No orchestration found for feature '{}'", feature_name)
            })?;

        let current_phase = entry.record.current_phase as u32;
        let status = entry.record.status.clone();

        Ok(OrchestrationState {
            phases_completed: current_phase,
            status,
        })
    })
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

/// Get the current git HEAD commit hash
fn get_current_git_hash() -> Result<String> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .context("Failed to get git hash")?;

    if !output.status.success() {
        anyhow::bail!("Not in a git repository");
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Check if the scenario should be skipped based on baseline
fn should_skip_baseline(scenario_dir: &Path) -> Result<Option<String>> {
    let last_passed = match load_last_passed(scenario_dir) {
        Some(lp) => lp,
        None => return Ok(None), // No baseline, need to run
    };

    let current_hash = match get_current_git_hash() {
        Ok(h) => h,
        Err(_) => return Ok(None), // Not in git repo, run anyway
    };

    // If we're on the same commit, skip
    if last_passed.commit_hash == current_hash {
        return Ok(Some(format!(
            "passed at commit {} on {}",
            &current_hash[..8.min(current_hash.len())],
            last_passed.timestamp.format("%Y-%m-%d %H:%M")
        )));
    }

    // Check if relevant files changed since last pass
    // For now, we check if ANY files changed - future improvement could
    // check only files relevant to the specific scenario
    let output = Command::new("git")
        .args([
            "diff",
            "--name-only",
            &last_passed.commit_hash,
            &current_hash,
            "--",
            "tina-harness/",
            "tina-session/",
            "tina-monitor/",
            "skills/",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let changed = String::from_utf8_lossy(&out.stdout);
            if changed.trim().is_empty() {
                // No relevant files changed
                Ok(Some(format!(
                    "no relevant changes since commit {}",
                    &last_passed.commit_hash[..8.min(last_passed.commit_hash.len())]
                )))
            } else {
                // Relevant files changed, need to run
                Ok(None)
            }
        }
        _ => {
            // If git diff fails (e.g., commit doesn't exist), run the test
            Ok(None)
        }
    }
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
                convex: None,
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
