use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tina_session::claude;
use tina_session::convex;
use tina_session::error::SessionError;
use tina_session::session::naming::session_name;
use tina_session::state::schema::SupervisorState;
use tina_session::tmux;

const CLAUDE_READY_TIMEOUT_SECS: u64 = 60;

/// Detect a working claude executable and return an absolute path.
fn detect_claude_binary() -> anyhow::Result<PathBuf> {
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

pub fn run(
    feature: &str,
    phase: &str,
    plan: Option<&Path>,
    design_id: Option<&str>,
    cwd_override: Option<&Path>,
    install_deps: bool,
    parent_team_id: Option<&str>,
) -> anyhow::Result<u8> {
    let orchestration =
        convex::run_convex(|mut writer| async move { writer.get_by_feature(feature).await })?
            .ok_or_else(|| anyhow::anyhow!("No orchestration found for feature '{}'", feature))?;

    let cwd = resolve_working_dir(cwd_override, orchestration.worktree_path.as_deref())?;

    let plan_abs = resolve_plan_file(feature, phase, &cwd, plan, design_id)?;

    // Load state to validate phase (only for integer phases)
    let state = SupervisorState::load(feature)?;
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
    let team_name = format!("{}-phase-{}", feature, phase);

    // Check if session already exists (resume case)
    if tmux::session_exists(&name) {
        println!("Session '{}' already exists. Resuming.", name);
        // Ensure phase team registration stores the real tmux session name.
        register_phase_team(&orchestration.id, &team_name, phase, parent_team_id, &name)?;

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

    // Install dependencies only if explicitly requested
    if install_deps {
        install_dependencies(&cwd);
    }

    // Create tmux session (starts a shell)
    println!("Creating session '{}' in {}", name, cwd.display());
    tmux::create_session(&name, &cwd, None)?;

    // Small delay to let shell initialize
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Detect which claude binary is available
    let claude_bin = detect_claude_binary()?;
    let claude_bin_str = claude_bin.to_string_lossy().to_string();
    let claude_cmd = format!(
        "{} --dangerously-skip-permissions",
        shell_quote(&claude_bin_str)
    );
    println!("Starting Claude ({}) in session...", claude_bin.display());
    tmux::send_keys(&name, &claude_cmd)?;

    // Wait for Claude to be ready
    println!(
        "Waiting for Claude to be ready (up to {}s)...",
        CLAUDE_READY_TIMEOUT_SECS
    );
    match claude::wait_for_ready(&name, CLAUDE_READY_TIMEOUT_SECS) {
        Ok(_) => {
            println!("Claude is ready.");
        }
        Err(e) => {
            eprintln!("Warning: {}", e);
            eprintln!("Proceeding anyway, but Claude may not be ready.");
        }
    }

    // Register the phase execution team in Convex so the daemon can sync
    // phase-level tasks and team members.
    register_phase_team(&orchestration.id, &team_name, phase, parent_team_id, &name)?;

    // Send the team-lead-init skill command with team_name
    let skill_cmd = format!(
        "/tina:team-lead-init team_name: {} plan_path: {}",
        team_name,
        plan_abs.display()
    );
    println!("Sending: {}", skill_cmd);
    tmux::send_keys(&name, &skill_cmd)?;

    println!("Started phase {} execution in session '{}'", phase, name);
    Ok(0)
}

fn resolve_plan_file(
    feature: &str,
    phase: &str,
    cwd: &Path,
    plan: Option<&Path>,
    design_id: Option<&str>,
) -> anyhow::Result<PathBuf> {
    if let Some(plan_path) = plan {
        let candidate = if plan_path.is_absolute() {
            plan_path.to_path_buf()
        } else {
            cwd.join(plan_path)
        };
        if !candidate.exists() {
            anyhow::bail!(SessionError::FileNotFound(candidate.display().to_string()));
        }
        return Ok(fs::canonicalize(candidate)?);
    }

    if let Some(design_id) = design_id {
        return materialize_plan_from_design(feature, phase, cwd, design_id);
    }

    anyhow::bail!("Must specify either --plan or --design-id");
}

fn materialize_plan_from_design(
    feature: &str,
    phase: &str,
    cwd: &Path,
    design_id: &str,
) -> anyhow::Result<PathBuf> {
    let design_id_owned = design_id.to_string();
    let design = convex::run_convex(
        |mut writer| async move { writer.get_design(&design_id_owned).await },
    )?
    .ok_or_else(|| anyhow::anyhow!("Design not found in Convex: {}", design_id))?;

    let plans_dir = cwd.join("docs").join("plans");
    fs::create_dir_all(&plans_dir)?;

    let safe_feature = feature.replace('/', "-");
    let filename = format!(
        "{}-{}-phase-{}.md",
        chrono::Utc::now().format("%Y-%m-%d"),
        safe_feature,
        phase
    );
    let plan_path = plans_dir.join(filename);

    if !plan_path.exists() {
        fs::write(&plan_path, design.markdown)?;
    }

    Ok(fs::canonicalize(plan_path)?)
}

fn resolve_working_dir(
    cwd_override: Option<&Path>,
    orchestration_worktree: Option<&str>,
) -> anyhow::Result<PathBuf> {
    let raw_path = match cwd_override {
        Some(path) => path.to_path_buf(),
        None => PathBuf::from(orchestration_worktree.ok_or_else(|| {
            anyhow::anyhow!("Orchestration has no worktree_path and --cwd was not provided")
        })?),
    };

    let cwd = if raw_path.is_absolute() {
        raw_path
    } else {
        std::env::current_dir()?.join(raw_path)
    };

    if !cwd.exists() {
        anyhow::bail!("Working directory does not exist: {}", cwd.display());
    }
    if !cwd.is_dir() {
        anyhow::bail!("Working directory is not a directory: {}", cwd.display());
    }

    Ok(cwd)
}

/// Register the phase execution team in Convex so the daemon can sync
/// phase-level tasks and team members to the orchestration.
fn register_phase_team(
    orchestration_id: &str,
    team_name: &str,
    phase: &str,
    parent_team_id: Option<&str>,
    tmux_session_name: &str,
) -> anyhow::Result<String> {
    let phase = phase.to_string();
    let parent = parent_team_id.map(|s| s.to_string());
    let tmux_session_name = tmux_session_name.to_string();
    convex::run_convex(|mut writer| async move {
        let args = convex::RegisterTeamArgs {
            team_name: team_name.to_string(),
            orchestration_id: orchestration_id.to_string(),
            lead_session_id: "pending".to_string(),
            tmux_session_name: Some(tmux_session_name),
            phase_number: Some(phase),
            parent_team_id: parent,
            created_at: chrono::Utc::now().timestamp_millis() as f64,
        };
        writer.register_team(&args).await
    })
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

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{resolve_plan_file, resolve_working_dir, shell_quote};

    #[test]
    fn resolve_working_dir_prefers_override() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let resolved = resolve_working_dir(Some(tmp.path()), None).expect("resolve");
        assert_eq!(resolved, tmp.path());
    }

    #[test]
    fn resolve_working_dir_uses_orchestration_path() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let worktree = tmp.path().display().to_string();
        let resolved = resolve_working_dir(None, Some(&worktree)).expect("resolve");
        assert_eq!(resolved, tmp.path());
    }

    #[test]
    fn resolve_working_dir_requires_path_source() {
        let err = resolve_working_dir(None, None).expect_err("expected error");
        assert!(err
            .to_string()
            .contains("Orchestration has no worktree_path and --cwd was not provided"));
    }

    #[test]
    fn resolve_plan_file_supports_relative_paths_from_worktree() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let plans_dir = tmp.path().join("docs").join("plans");
        std::fs::create_dir_all(&plans_dir).expect("plans dir");
        let plan = plans_dir.join("phase-1.md");
        std::fs::write(&plan, "# plan").expect("write plan");

        let resolved = resolve_plan_file(
            "auth",
            "1",
            tmp.path(),
            Some(Path::new("docs/plans/phase-1.md")),
            None,
        )
        .expect("resolve plan");
        assert_eq!(resolved, std::fs::canonicalize(plan).expect("canonicalize"));
    }

    #[test]
    fn resolve_plan_file_requires_plan_or_design_id() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let err = resolve_plan_file("auth", "1", tmp.path(), None, None).expect_err("error");
        assert!(err
            .to_string()
            .contains("Must specify either --plan or --design-id"));
    }

    #[test]
    fn shell_quote_wraps_and_escapes() {
        assert_eq!(
            shell_quote("/usr/local/bin/claude"),
            "\"/usr/local/bin/claude\""
        );
        assert_eq!(shell_quote("a\"b"), "\"a\\\"b\"");
    }
}
