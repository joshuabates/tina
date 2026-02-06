use std::fs;
use std::path::Path;
use std::process::Command;

use tina_session::claude;
use tina_session::error::SessionError;
use tina_session::session::lookup::SessionLookup;
use tina_session::session::naming::session_name;
use tina_session::state::schema::SupervisorState;
use tina_session::tmux;

const CLAUDE_READY_TIMEOUT_SECS: u64 = 60;

/// Detect which claude binary is available.
/// Prefers 'claudesp' (sneak peek) over 'claude' (release).
fn detect_claude_binary() -> &'static str {
    // Check for claudesp first (sneak peek version)
    if Command::new("which")
        .arg("claudesp")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return "claudesp";
    }

    // Fall back to claude
    if Command::new("which")
        .arg("claude")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return "claude";
    }

    // Default to claude and let it fail with a clear error
    "claude"
}

pub fn run(feature: &str, phase: &str, plan: &Path) -> anyhow::Result<u8> {
    // Load lookup to get cwd
    let lookup = SessionLookup::load(feature)?;
    let cwd = &lookup.cwd;

    // Validate plan exists and resolve to absolute path
    if !plan.exists() {
        anyhow::bail!(SessionError::FileNotFound(plan.display().to_string()));
    }
    let plan_abs = fs::canonicalize(plan)?;

    // Load state to validate phase (only for integer phases)
    let state = SupervisorState::load(cwd)?;
    if let Ok(phase_num) = phase.parse::<u32>() {
        if phase_num > state.total_phases {
            anyhow::bail!(
                "Phase {} does not exist (total phases: {}).\n\
                 \n\
                 Valid phases: 1-{}\n\
                 Remediation phases (e.g., 1.5, 2.5) are created dynamically.",
                phase_num,
                state.total_phases,
                state.total_phases
            );
        }
    }
    // Decimal phases (e.g., "1.5") are remediation phases - skip validation

    // Generate session name
    let name = session_name(feature, phase);

    // Check if session already exists (resume case)
    if tmux::session_exists(&name) {
        println!("Session '{}' already exists. Resuming.", name);
        // Session exists, just need to verify Claude is ready
        match claude::wait_for_ready(&name, 10) {
            Ok(_) => {
                println!("Claude is ready in existing session.");
                return Ok(0);
            }
            Err(_) => {
                println!("Warning: Claude may not be ready in existing session.");
                return Ok(0);
            }
        }
    }

    // Install dependencies if needed
    install_dependencies(cwd);

    // Create tmux session (starts a shell)
    println!("Creating session '{}' in {}", name, cwd.display());
    tmux::create_session(&name, cwd, None)?;

    // Small delay to let shell initialize
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Detect which claude binary is available (claudesp for sneak peek, claude for release)
    let claude_bin = detect_claude_binary();
    let claude_cmd = format!("{} --dangerously-skip-permissions", claude_bin);
    println!("Starting Claude ({}) in session...", claude_bin);
    tmux::send_keys(&name, &claude_cmd)?;

    // Wait for Claude to be ready
    println!("Waiting for Claude to be ready (up to {}s)...", CLAUDE_READY_TIMEOUT_SECS);
    match claude::wait_for_ready(&name, CLAUDE_READY_TIMEOUT_SECS) {
        Ok(_) => {
            println!("Claude is ready.");
        }
        Err(e) => {
            eprintln!("Warning: {}", e);
            eprintln!("Proceeding anyway, but Claude may not be ready.");
        }
    }

    // Send the team-lead-init skill command
    let skill_cmd = format!("/tina:team-lead-init {}", plan_abs.display());
    println!("Sending: {}", skill_cmd);
    tmux::send_keys(&name, &skill_cmd)?;

    println!("Started phase {} execution in session '{}'", phase, name);
    Ok(0)
}

/// Detect and install project dependencies. Non-fatal on failure.
fn install_dependencies(cwd: &Path) {
    if cwd.join("package.json").exists() {
        eprintln!("Installing npm dependencies...");
        match Command::new("npm")
            .args(["install"])
            .current_dir(cwd)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
        {
            Ok(status) if status.success() => eprintln!("npm install complete."),
            Ok(status) => eprintln!("Warning: npm install exited with {}", status),
            Err(e) => eprintln!("Warning: Failed to run npm install: {}", e),
        }
    }

    if cwd.join("Cargo.toml").exists() {
        eprintln!("Building Rust dependencies...");
        match Command::new("cargo")
            .args(["build"])
            .current_dir(cwd)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
        {
            Ok(status) if status.success() => eprintln!("cargo build complete."),
            Ok(status) => eprintln!("Warning: cargo build exited with {}", status),
            Err(e) => eprintln!("Warning: Failed to run cargo build: {}", e),
        }
    }

    if cwd.join("requirements.txt").exists() {
        eprintln!("Installing Python dependencies...");
        match Command::new("pip")
            .args(["install", "-r", "requirements.txt"])
            .current_dir(cwd)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
        {
            Ok(status) if status.success() => eprintln!("pip install complete."),
            Ok(status) => eprintln!("Warning: pip install exited with {}", status),
            Err(e) => eprintln!("Warning: Failed to run pip install: {}", e),
        }
    }
}

