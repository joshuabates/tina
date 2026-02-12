//! Run command implementation
//!
//! Executes a scenario end-to-end with mock or real orchestration.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, Instant};

use chrono::Utc;

use anyhow::{Context, Result};
use serde::Deserialize;

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
    fn success(scenario_name: String, feature_name: String, work_dir: PathBuf) -> Self {
        Self {
            scenario_name,
            feature_name,
            passed: true,
            failures: vec![],
            work_dir,
            skipped: false,
        }
    }

    fn failure(
        scenario_name: String,
        feature_name: String,
        work_dir: PathBuf,
        failures: Vec<CategorizedFailure>,
    ) -> Self {
        Self {
            scenario_name,
            feature_name,
            passed: false,
            failures,
            work_dir,
            skipped: false,
        }
    }

    fn skipped(scenario_name: String, feature_name: String, work_dir: PathBuf) -> Self {
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
    /// Skip binary rebuild (use existing binaries)
    pub skip_build: bool,
}

/// Run the command with the given config
pub fn run(scenario_name: &str, config: &RunConfig) -> Result<RunResult> {
    // Load scenario
    let scenario_dir = config.scenarios_dir.join(scenario_name);
    let scenario = load_scenario(&scenario_dir)
        .with_context(|| format!("Failed to load scenario: {}", scenario_name))?;

    // Rebuild binaries unless --skip-build
    if !config.skip_build {
        // Project root is two levels up from scenarios_dir:
        // scenarios_dir = <root>/tina-harness/scenarios
        let project_root = config
            .scenarios_dir
            .parent() // tina-harness/
            .and_then(|p| p.parent()) // <root>/
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "Cannot determine project root from scenarios_dir: {}",
                    config.scenarios_dir.display()
                )
            })?;
        rebuild_binaries(project_root)?;
    } else {
        eprintln!("Skipping binary rebuild (--skip-build)");
    }

    // Create work directory
    let scenario_work_dir = config.work_dir.join(&scenario.name);

    // Check baseline skip logic (unless --force-baseline)
    if !config.force_baseline {
        if let Some(skip_reason) = should_skip_baseline(&scenario_dir)? {
            eprintln!("Skipping {}: {}", scenario_name, skip_reason);
            return Ok(RunResult::skipped(
                scenario.name,
                scenario.feature_name,
                scenario_work_dir,
            ));
        }
    }

    if scenario_work_dir.exists() {
        fs::remove_dir_all(&scenario_work_dir).with_context(|| {
            format!(
                "Failed to clean work directory: {}",
                scenario_work_dir.display()
            )
        })?;
    }

    // Copy test-project to work directory
    copy_dir_recursive(&config.test_project_dir, &scenario_work_dir)
        .context("Failed to copy test-project")?;

    // Apply setup patch if present
    if let Some(ref patch) = scenario.setup_patch {
        if let Err(e) = apply_patch(&scenario_work_dir, patch) {
            return Ok(RunResult::failure(
                scenario.name.clone(),
                scenario.feature_name.clone(),
                scenario_work_dir,
                vec![CategorizedFailure::patch_failed(e.to_string())],
            ));
        }
    }

    // Verify baseline compilation
    if let Err(e) = verify_compilation(&scenario_work_dir) {
        return Ok(RunResult::failure(
            scenario.name.clone(),
            scenario.feature_name.clone(),
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
                scenario.feature_name.clone(),
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
            scenario.feature_name.clone(),
            scenario_work_dir,
            vec![CategorizedFailure::new(
                FailureCategory::Setup,
                "Baseline tests failed before orchestration",
            )
            .with_details(e.to_string())],
        ));
    }

    // Use a unique feature name for full runs so stale active orchestrations
    // in Convex from previous harness attempts cannot block init.
    let run_feature_name = if config.full {
        unique_feature_name(&scenario.feature_name)
    } else {
        scenario.feature_name.clone()
    };

    // Run orchestration (mock or real)
    let state = if config.full {
        run_full_orchestration(&scenario_work_dir, &scenario, &run_feature_name)?
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
        Ok(RunResult::success(
            scenario.name,
            run_feature_name,
            scenario_work_dir,
        ))
    } else {
        Ok(RunResult::failure(
            scenario.name,
            run_feature_name,
            scenario_work_dir,
            failures,
        ))
    }
}

/// Mock orchestration state (simulates what orchestration would produce)
#[derive(Debug)]
struct OrchestrationState {
    phases_completed: u32,
    status: String,
}

/// Run mock orchestration (simulates state without invoking real orchestration)
fn run_mock_orchestration(_work_dir: &Path, scenario: &Scenario) -> Result<OrchestrationState> {
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
    feature_name: &str,
) -> Result<OrchestrationState> {
    eprintln!("Feature name: {}", feature_name);

    // Clean up stale state from previous runs
    cleanup_stale_state(feature_name);

    // Write the design doc to the work directory
    // Force H1 to match this run's feature so orchestrate flows that derive
    // feature names from the document cannot collapse back to a stale base name.
    let design_doc = design_doc_for_run(&scenario.design_doc, &scenario.feature_name, feature_name);
    let design_path = work_dir.join("design.md");
    fs::write(&design_path, design_doc).context("Failed to write design doc to work directory")?;
    let design_markdown =
        fs::read_to_string(&design_path).context("Failed to read design doc from work directory")?;
    let design_id = seed_design_in_convex(work_dir, &design_markdown, feature_name)?;

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
    eprintln!(
        "Creating tmux session '{}' in {}",
        session_name,
        work_dir.display()
    );
    tina_session::tmux::create_session(&session_name, work_dir, None)
        .map_err(|e| anyhow::anyhow!("Failed to create tmux session: {}", e))?;

    // Small delay to let shell initialize
    std::thread::sleep(Duration::from_millis(500));

    // Harness runs against the dev Convex profile by default.
    tina_session::tmux::send_keys(&session_name, "export TINA_ENV=dev")
        .map_err(|e| anyhow::anyhow!("Failed to set TINA_ENV in tmux session: {}", e))?;
    std::thread::sleep(Duration::from_millis(200));

    // Launch Claude in interactive mode with permissions bypass
    let claude_bin = detect_claude_binary()?;
    let claude_bin_str = claude_bin.to_string_lossy().to_string();
    let teammate_settings = r#"{"teammateMode":"tmux"}"#;
    let claude_cmd = format!(
        "{} --dangerously-skip-permissions --settings {}",
        shell_quote(&claude_bin_str),
        shell_quote(teammate_settings)
    );
    eprintln!("Starting Claude ({}) in session...", claude_bin.display());
    tina_session::tmux::send_keys(&session_name, &claude_cmd)
        .map_err(|e| anyhow::anyhow!("Failed to send claude command: {}", e))?;

    // Wait for Claude to be ready
    eprintln!(
        "Waiting for Claude to be ready (up to {}s)...",
        CLAUDE_READY_TIMEOUT_SECS
    );
    match tina_session::claude::wait_for_ready(&session_name, CLAUDE_READY_TIMEOUT_SECS) {
        Ok(_) => eprintln!("Claude is ready."),
        Err(e) => {
            let pane_tail = tina_session::tmux::capture_pane_lines(&session_name, 80)
                .unwrap_or_else(|_| "<unable to capture tmux pane>".to_string());
            anyhow::bail!(
                "Claude not ready after {}s: {}\nTmux pane tail:\n{}",
                CLAUDE_READY_TIMEOUT_SECS,
                e,
                pane_tail
            );
        }
    }

    // Let TUI settle before sending commands
    std::thread::sleep(Duration::from_secs(2));

    // Record time before sending command so we can filter stale orchestrations
    let started_after = Utc::now().to_rfc3339();

    // Send the orchestrate skill command using a Convex design ID.
    let skill_cmd = format!(
        "/tina:orchestrate --feature {} --design-id {}",
        feature_name, design_id
    );
    eprintln!("Sending: {}", skill_cmd);
    tina_session::tmux::send_keys(&session_name, &skill_cmd)
        .map_err(|e| anyhow::anyhow!("Failed to send orchestrate command: {}", e))?;

    // Wait for orchestration to complete by polling Convex supervisor state
    eprintln!(
        "Waiting for orchestration to complete (timeout: {}s)...",
        ORCHESTRATION_TIMEOUT_SECS
    );
    let result = wait_for_orchestration_complete(
        feature_name,
        &session_name,
        ORCHESTRATION_TIMEOUT_SECS,
        &started_after,
    );

    let fallback_check = if result.is_ok() {
        assert_no_inprocess_agent_fallback(feature_name).err()
    } else {
        None
    };

    // Always clean up the tmux session
    eprintln!("Cleaning up tmux session '{}'", session_name);
    let _ = tina_session::tmux::kill_session(&session_name);

    if let Some(err) = fallback_check {
        return Err(err);
    }

    result
}

/// Build a per-run feature name to isolate full harness orchestrations.
fn unique_feature_name(base: &str) -> String {
    let ts = Utc::now().format("%Y%m%d%H%M%S");
    format!("{}-h{}", base, ts)
}

/// Detect a working claude executable and return an absolute path.
fn detect_claude_binary() -> Result<PathBuf> {
    let claude_path = find_executable("claude")
        .ok_or_else(|| anyhow::anyhow!("claude binary not found in PATH"))?;

    let is_working = Command::new(&claude_path)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !is_working {
        anyhow::bail!(
            "claude executable is not runnable: {}",
            claude_path.display()
        );
    }

    Ok(claude_path)
}

fn find_executable(name: &str) -> Option<PathBuf> {
    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        for candidate in [
            home.join(".local/bin").join(name),
            home.join("bin").join(name),
        ] {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    for base in ["/usr/local/bin", "/opt/homebrew/bin"] {
        let candidate = PathBuf::from(base).join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn shell_quote(arg: &str) -> String {
    format!("\"{}\"", arg.replace('\\', "\\\\").replace('"', "\\\""))
}

#[derive(Debug, Deserialize)]
struct TeamConfig {
    #[serde(rename = "leadSessionId")]
    lead_session_id: String,
}

fn collect_inprocess_agent_fallbacks(log_contents: &str) -> Vec<String> {
    log_contents
        .lines()
        .filter(|line| {
            line.contains("[handleSpawnInProcess]")
                && line.contains("agent_type=tina:")
                && line.contains("found=false")
        })
        .map(ToString::to_string)
        .collect()
}

fn assert_no_inprocess_agent_fallback(feature_name: &str) -> Result<()> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("could not determine home dir"))?;
    let team_config_path = home
        .join(".claude")
        .join("teams")
        .join(format!("{}-orchestration", feature_name))
        .join("config.json");

    if !team_config_path.exists() {
        eprintln!(
            "Warning: cannot verify agent fallback (missing team config at {})",
            team_config_path.display()
        );
        return Ok(());
    }

    let cfg_raw = fs::read_to_string(&team_config_path)
        .with_context(|| format!("Failed to read team config {}", team_config_path.display()))?;
    let cfg: TeamConfig = serde_json::from_str(&cfg_raw)
        .with_context(|| format!("Failed to parse team config {}", team_config_path.display()))?;

    let debug_log_path = home
        .join(".claude")
        .join("debug")
        .join(format!("{}.txt", cfg.lead_session_id));
    if !debug_log_path.exists() {
        eprintln!(
            "Warning: cannot verify agent fallback (missing debug log at {})",
            debug_log_path.display()
        );
        return Ok(());
    }

    let log_contents = fs::read_to_string(&debug_log_path)
        .with_context(|| format!("Failed to read debug log {}", debug_log_path.display()))?;
    let fallback_lines = collect_inprocess_agent_fallbacks(&log_contents);
    if fallback_lines.is_empty() {
        return Ok(());
    }

    let sample = fallback_lines
        .iter()
        .take(3)
        .map(|line| format!("  - {}", line))
        .collect::<Vec<_>>()
        .join("\n");

    anyhow::bail!(
        "Detected {} in-process Tina agent fallback(s) (found=false) in {}.\n{}\n\
This means custom teammate agents were not resolved and orchestration likely ran with generic prompts.\n\
Set teammate mode to tmux (or verify Claude settings) and rerun the harness.",
        fallback_lines.len(),
        debug_log_path.display(),
        sample
    );
}

/// Rebuild tina-session and tina-daemon binaries from source.
///
/// Each crate is built individually since there is no workspace Cargo.toml.
/// A debug build is sufficient for harness runs.
///
/// After rebuild, tina-daemon is restarted unconditionally so harness runs
/// always have live team/task synchronization.
fn rebuild_binaries(project_root: &Path) -> Result<()> {
    eprintln!("Rebuilding tina binaries...");

    // Build tina-session
    let session_dir = project_root.join("tina-session");
    eprintln!("  Building tina-session...");
    let output = Command::new("cargo")
        .args(["build"])
        .current_dir(&session_dir)
        .output()
        .context("Failed to run cargo build for tina-session")?;

    if !output.status.success() {
        anyhow::bail!(
            "tina-session build failed:\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    // Build tina-daemon
    let daemon_dir = project_root.join("tina-daemon");
    eprintln!("  Building tina-daemon...");
    let output = Command::new("cargo")
        .args(["build"])
        .current_dir(&daemon_dir)
        .output()
        .context("Failed to run cargo build for tina-daemon")?;

    if !output.status.success() {
        anyhow::bail!(
            "tina-daemon build failed:\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let session_bin = session_dir
        .join("target")
        .join("debug")
        .join("tina-session");
    let daemon_bin = daemon_dir.join("target").join("debug").join("tina-daemon");
    if !session_bin.exists() {
        anyhow::bail!(
            "tina-session binary not found after build: {}",
            session_bin.display()
        );
    }
    if !daemon_bin.exists() {
        anyhow::bail!(
            "tina-daemon binary not found after build: {}",
            daemon_bin.display()
        );
    }

    // Restart daemon unconditionally.
    eprintln!("  Restarting tina-daemon with new binary...");
    let _ = Command::new(&session_bin).args(["daemon", "stop"]).output();
    let _ = Command::new("pkill").args(["-f", "tina-daemon"]).output();
    std::thread::sleep(Duration::from_millis(500));

    let child = Command::new(&daemon_bin)
        .args(["--env", "dev"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .with_context(|| format!("Failed to launch daemon binary {}", daemon_bin.display()))?;
    eprintln!("  Started tina-daemon pid={}", child.id());

    std::thread::sleep(Duration::from_millis(500));
    if !super::verify::check_daemon_running() {
        anyhow::bail!("tina-daemon did not start successfully");
    }

    eprintln!("Binary rebuild complete.");
    Ok(())
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

    // Also kill stale phase sessions for this feature so tina-session start
    // cannot accidentally resume an unrelated run.
    let phase_prefix = format!("tina-{}-phase-", feature_name);
    if let Ok(sessions) = tina_session::tmux::list_sessions() {
        for session in sessions
            .into_iter()
            .filter(|s| s.starts_with(&phase_prefix))
        {
            eprintln!("Killing stale phase session: {}", session);
            let _ = tina_session::tmux::kill_session(&session);
        }
    }
}

/// Build the run-specific design doc content.
///
/// For full runs with a unique feature name, rewrite the first H1 (or prepend
/// one if missing) so orchestrate flows that derive feature from doc title stay
/// aligned with the requested run feature.
fn design_doc_for_run(design_doc: &str, scenario_feature: &str, run_feature: &str) -> String {
    if run_feature == scenario_feature {
        return design_doc.to_string();
    }

    let mut replaced = false;
    let mut lines = Vec::new();
    for line in design_doc.lines() {
        if !replaced && line.starts_with("# ") {
            lines.push(format!("# {}", run_feature));
            replaced = true;
        } else {
            lines.push(line.to_string());
        }
    }

    if !replaced {
        let mut out = Vec::with_capacity(lines.len() + 2);
        out.push(format!("# {}", run_feature));
        out.push(String::new());
        out.extend(lines);
        return out.join("\n");
    }

    lines.join("\n")
}

/// Extract a design title from markdown H1, falling back to the feature name.
fn extract_design_title(markdown: &str, fallback_feature: &str) -> String {
    markdown
        .lines()
        .find_map(|line| line.strip_prefix("# "))
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| fallback_feature.to_string())
}

/// Create a Convex design record for this harness run and return the design ID.
fn seed_design_in_convex(work_dir: &Path, design_markdown: &str, feature_name: &str) -> Result<String> {
    let repo_name = work_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(feature_name)
        .to_string();
    let repo_path = work_dir.canonicalize()?.to_string_lossy().to_string();
    let title = extract_design_title(design_markdown, feature_name);
    let markdown = design_markdown.to_string();

    tina_session::convex::run_convex(|mut writer| async move {
        let project_id = writer.find_or_create_project(&repo_name, &repo_path).await?;
        writer.create_design(&project_id, &title, &markdown).await
    })
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
    started_after: &str,
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
            return load_orchestration_state_from_convex(feature_name, started_after);
        }

        // Try to load state from Convex
        match load_orchestration_state_from_convex(feature_name, started_after) {
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
                if let Some((reason, pane)) = detect_tmux_fatal_state(session_name) {
                    anyhow::bail!(
                        "Orchestration failed before Convex state was created: {}\nTmux pane tail:\n{}",
                        reason,
                        pane
                    );
                }

                let elapsed = start.elapsed().as_secs();
                if elapsed % 30 == 0 && elapsed > 0 {
                    eprintln!("[{}s] Waiting for orchestration state: {}", elapsed, e);
                }
            }
        }

        std::thread::sleep(poll_interval);
    }
}

/// Inspect tmux output for fatal conditions that prevent orchestration startup.
fn detect_tmux_fatal_state(session_name: &str) -> Option<(String, String)> {
    let pane = tina_session::tmux::capture_pane_lines(session_name, 120).ok()?;
    let lower = pane.to_lowercase();

    if lower.contains("you've hit your limit") || lower.contains("hit your limit") {
        return Some(("Claude usage limit reached".to_string(), pane));
    }
    if lower.contains("claude: command not found") {
        return Some((
            "claude executable not found in tmux shell".to_string(),
            pane,
        ));
    }
    if lower.contains("/tina:orchestrate: no such file or directory") {
        return Some((
            "orchestrate command was sent to shell because Claude did not start".to_string(),
            pane,
        ));
    }

    None
}

/// Load orchestration state from Convex for a given feature name.
///
/// Uses `listOrchestrations` via TinaConvexClient to find the most recent
/// orchestration matching the feature name, avoiding node_id mismatch issues.
fn load_orchestration_state_from_convex(
    feature_name: &str,
    started_after: &str,
) -> Result<OrchestrationState> {
    let rt = tokio::runtime::Runtime::new()?;
    rt.block_on(async {
        let cfg = tina_session::config::load_config_for_env(Some("dev"))?;
        let convex_url = cfg
            .convex_url
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow::anyhow!("convex_url not set in config"))?;

        let mut client = tina_data::TinaConvexClient::new(&convex_url).await?;
        let orchestrations = client.list_orchestrations().await?;

        // Find the most recent orchestration for this feature (exact match).
        // Also filter by started_after to ignore stale orchestrations from previous runs.
        let entry = orchestrations
            .iter()
            .filter(|o| {
                let name_matches = o.record.feature_name == feature_name;
                let is_recent = o.record.started_at.as_str() >= started_after;
                name_matches && is_recent
            })
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

/// Find the most recently modified worktree directory under work_dir/.worktrees/
fn find_latest_worktree(work_dir: &Path) -> Option<PathBuf> {
    let worktrees_dir = work_dir.join(".worktrees");
    if !worktrees_dir.exists() {
        return None;
    }
    fs::read_dir(&worktrees_dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .max_by_key(|e| e.metadata().ok().and_then(|m| m.modified().ok()))
        .map(|e| e.path())
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

    // Use worktree for file/test assertions since the executor works there
    let check_dir = find_latest_worktree(work_dir).unwrap_or_else(|| work_dir.to_path_buf());

    // Check tests pass (if required)
    if expected.assertions.tests_pass {
        if let Err(e) = run_tests(&check_dir) {
            failures.push(CategorizedFailure::tests_failed(e.to_string()));
        }
    }

    // Check file assertions
    for file_assertion in &expected.assertions.file_changes {
        if let Some(failure) = check_file_assertion(&check_dir, file_assertion) {
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

    #[test]
    fn test_rebuild_binaries_fails_with_bad_path() {
        let bad_path = Path::new("/tmp/nonexistent-tina-project");
        let result = rebuild_binaries(bad_path);
        assert!(result.is_err());
    }

    #[test]
    fn test_run_config_has_skip_build() {
        let config = RunConfig {
            scenarios_dir: PathBuf::from("/tmp"),
            test_project_dir: PathBuf::from("/tmp"),
            work_dir: PathBuf::from("/tmp"),
            full: false,
            force_baseline: false,
            skip_build: true,
        };
        assert!(config.skip_build);
    }

    #[test]
    fn test_run_config_team_pattern_defaults() {
        // In team mode, the lead rebuilds and the runner uses --skip-build
        let config = RunConfig {
            scenarios_dir: PathBuf::from("/tmp/scenarios"),
            test_project_dir: PathBuf::from("/tmp/test-project"),
            work_dir: PathBuf::from("/tmp/work"),
            full: true,
            force_baseline: true, // Team mode always forces (no baseline skip)
            skip_build: true,     // Lead already rebuilt
        };
        assert!(config.full);
        assert!(config.force_baseline);
        assert!(config.skip_build);
    }

    #[test]
    fn test_rebuild_binaries_requires_valid_project_root() {
        // Verify that rebuild_binaries checks for crate directories
        let temp = TempDir::new().unwrap();
        let result = rebuild_binaries(temp.path());
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        // Should fail because tina-session directory doesn't exist
        assert!(
            err.contains("tina-session") || err.contains("cargo build"),
            "Error should mention tina-session or cargo: {}",
            err
        );
    }

    #[test]
    fn test_unique_feature_name_prefixes_base() {
        let name = unique_feature_name("calculator");
        assert!(name.starts_with("calculator-h"));
        assert!(name.len() > "calculator-h".len());
    }

    #[test]
    fn test_design_doc_for_run_rewrites_existing_h1_for_unique_feature() {
        let original = "# Calculator\n\n## Phase 1\nDo work";
        let rewritten = design_doc_for_run(original, "calculator", "calculator-h20260211");
        assert!(rewritten.starts_with("# calculator-h20260211\n"));
        assert!(rewritten.contains("## Phase 1"));
    }

    #[test]
    fn test_design_doc_for_run_prepends_h1_when_missing() {
        let original = "## Phase 1\nDo work";
        let rewritten = design_doc_for_run(original, "calculator", "calculator-h20260211");
        assert!(rewritten.starts_with("# calculator-h20260211\n\n"));
        assert!(rewritten.contains("## Phase 1"));
    }

    #[test]
    fn test_extract_design_title_prefers_h1() {
        let markdown = "# Calculator API\n\n## Phase 1\nDo work";
        let title = extract_design_title(markdown, "calculator-api");
        assert_eq!(title, "Calculator API");
    }

    #[test]
    fn test_extract_design_title_falls_back_when_h1_missing() {
        let markdown = "## Phase 1\nDo work";
        let title = extract_design_title(markdown, "calculator-api");
        assert_eq!(title, "calculator-api");
    }

    #[test]
    fn test_collect_inprocess_agent_fallbacks_finds_tina_spawn_failures() {
        let log = r#"
2026-02-11T08:36:42.750Z [DEBUG] [handleSpawnInProcess] agent_type=tina:phase-executor, found=false
2026-02-11T08:36:42.751Z [DEBUG] [handleSpawnInProcess] agent_type=general-purpose, found=true
2026-02-11T08:44:37.772Z [DEBUG] [handleSpawnInProcess] agent_type=tina:phase-reviewer, found=false
"#;

        let lines = collect_inprocess_agent_fallbacks(log);
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains("tina:phase-executor"));
        assert!(lines[1].contains("tina:phase-reviewer"));
    }
}
