use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use chrono::Utc;

use tina_session::claude;
use tina_session::error::SessionError;
use tina_session::session::naming::{
    orchestration_session_name, orchestration_team_name,
};
use tina_session::state::schema::{
    ArchitectMode, DetectorScope, ReviewEnforcement, SupervisorState, TestIntegrityProfile,
};
use tina_session::tmux;

use tina_session::convex;

const STATUSLINE_SCRIPT: &str = r#"#!/bin/bash
set -e
TINA_DIR="${PWD}/.claude/tina"
mkdir -p "$TINA_DIR"
INPUT=$(cat)
echo "$INPUT" | jq '{
  used_pct: (.context_window.used_percentage // 0),
  tokens: (.context_window.total_input_tokens // 0),
  max: (.context_window.context_window_size // 200000),
  timestamp: now | todate
}' > "$TINA_DIR/context-metrics.json"
echo "ctx:$(echo "$INPUT" | jq -r '.context_window.used_percentage // 0 | floor')%"
"#;
const CLAUDE_READY_TIMEOUT_SECS: u64 = 60;

pub fn run(
    feature: &str,
    cwd: &Path,
    spec_doc: Option<&Path>,
    spec_id: Option<&str>,
    branch: &str,
    total_phases: u32,
    review_enforcement: Option<&str>,
    detector_scope: Option<&str>,
    architect_mode: Option<&str>,
    test_integrity_profile: Option<&str>,
    hard_block_detectors: Option<bool>,
    allow_rare_override: Option<bool>,
    require_fix_first: Option<bool>,
) -> anyhow::Result<u8> {
    run_with_options(
        feature,
        cwd,
        spec_doc,
        spec_id,
        branch,
        total_phases,
        review_enforcement,
        detector_scope,
        architect_mode,
        test_integrity_profile,
        hard_block_detectors,
        allow_rare_override,
        require_fix_first,
        false,
    )
}

pub fn run_with_options(
    feature: &str,
    cwd: &Path,
    spec_doc: Option<&Path>,
    spec_id: Option<&str>,
    branch: &str,
    total_phases: u32,
    review_enforcement: Option<&str>,
    detector_scope: Option<&str>,
    architect_mode: Option<&str>,
    test_integrity_profile: Option<&str>,
    hard_block_detectors: Option<bool>,
    allow_rare_override: Option<bool>,
    require_fix_first: Option<bool>,
    launch_orchestrator: bool,
) -> anyhow::Result<u8> {
    // Validate exactly one spec source
    match (spec_doc, spec_id) {
        (Some(_), Some(_)) => anyhow::bail!("Cannot specify both --spec-doc and --spec-id"),
        (None, None) => anyhow::bail!("Must specify either --spec-doc or --spec-id"),
        _ => {}
    }

    // Validate cwd (project root) exists
    if !cwd.exists() {
        anyhow::bail!(SessionError::DirectoryNotFound(cwd.display().to_string()));
    }
    if !cwd.is_dir() {
        anyhow::bail!(SessionError::DirectoryNotFound(format!(
            "{} is not a directory",
            cwd.display()
        )));
    }

    let cwd_abs = fs::canonicalize(cwd)?;

    // Resolve spec source: either a local file or a Convex spec ID
    let (spec_doc_path, resolved_spec_id, spec_markdown) =
        resolve_spec_source(spec_doc, spec_id)?;

    // Check if already initialized via Convex (only block on active orchestrations)
    if let Some(existing) = check_existing_orchestration(feature)? {
        let is_terminal = existing.status == "complete" || existing.status == "blocked";
        let has_worktree = existing
            .worktree_path
            .as_ref()
            .is_some_and(|path| !path.trim().is_empty());

        if !is_terminal && has_worktree {
            if launch_orchestrator {
                let worktree = existing.worktree_path.unwrap_or_default();
                let worktree_path = PathBuf::from(worktree.clone());
                let session_name = start_orchestration_session(
                    feature,
                    &worktree_path,
                    resolved_spec_id.as_deref(),
                    &spec_doc_path,
                )?;
                let team_name = orchestration_team_name(feature);
                let team_id =
                    register_orchestration_team(&existing.id, &team_name, Some(&session_name))?;
                auto_start_daemon();

                let mut output = serde_json::json!({
                    "orchestration_id": existing.id,
                    "team_id": team_id,
                    "worktree_path": worktree,
                    "feature": feature,
                    "branch": existing.branch,
                    "spec_doc": existing.spec_doc_path,
                    "total_phases": existing.total_phases,
                    "tmux_session_name": session_name,
                });
                if let Some(did) = existing.spec_id {
                    output["spec_id"] = serde_json::Value::String(did);
                }
                println!("{}", serde_json::to_string(&output)?);
                return Ok(0);
            }

            let worktree = existing.worktree_path.unwrap_or_default();
            anyhow::bail!(SessionError::AlreadyInitialized(
                feature.to_string(),
                worktree,
            ));
        }
    }

    // Create .worktrees directory
    let worktrees_dir = cwd_abs.join(".worktrees");
    fs::create_dir_all(&worktrees_dir)?;

    // Ensure .worktrees is gitignored
    ensure_gitignored(&cwd_abs, ".worktrees")?;

    // Create git worktree
    let worktree_path = worktrees_dir.join(feature);
    let actual_branch = create_worktree(&cwd_abs, &worktree_path, branch)?;

    // Write statusline config files
    write_statusline_config(&worktree_path)?;

    // Best-effort: generate AGENTS.md for Codex agents
    if let Err(e) = generate_agents_md(&worktree_path) {
        eprintln!("Warning: Failed to generate AGENTS.md: {}", e);
    }

    // When using --spec-id, write spec markdown to worktree for local access
    if let Some(markdown) = spec_markdown.as_deref() {
        write_spec_to_worktree(&worktree_path, markdown)?;
    }

    // Create supervisor state file in worktree
    let mut state = if let Some(did) = resolved_spec_id.as_deref() {
        SupervisorState::new_with_spec_id(
            feature,
            worktree_path.clone(),
            &actual_branch,
            total_phases,
            did,
        )
    } else {
        SupervisorState::new(
            feature,
            spec_doc_path.clone(),
            worktree_path.clone(),
            &actual_branch,
            total_phases,
        )
    };
    apply_review_policy_overrides(
        &mut state,
        review_enforcement,
        detector_scope,
        architect_mode,
        test_integrity_profile,
        hard_block_detectors,
        allow_rare_override,
        require_fix_first,
    )?;
    state.save()?;

    // Write orchestration record to Convex
    let orch_id = write_to_convex(
        feature,
        &worktree_path,
        &spec_doc_path,
        &actual_branch,
        total_phases,
        &cwd_abs,
        resolved_spec_id.as_deref(),
    )?;

    let orchestration_tmux_session = if launch_orchestrator {
        Some(start_orchestration_session(
            feature,
            &worktree_path,
            resolved_spec_id.as_deref(),
            &spec_doc_path,
        )?)
    } else {
        None
    };

    // Pre-register the orchestration team in Convex so the daemon can link
    // teams/tasks to this orchestration. The lead_session_id is a placeholder
    // until the real team lead starts and re-registers via upsert.
    let team_name = orchestration_team_name(feature);
    let team_id = register_orchestration_team(
        &orch_id,
        &team_name,
        orchestration_tmux_session.as_deref(),
    )?;

    auto_start_daemon();

    // Output JSON for orchestrator to capture
    let mut output = serde_json::json!({
        "orchestration_id": orch_id,
        "team_id": team_id,
        "worktree_path": worktree_path.display().to_string(),
        "feature": feature,
        "branch": actual_branch,
        "spec_doc": spec_doc_path.display().to_string(),
        "total_phases": total_phases,
    });
    if let Some(did) = resolved_spec_id.as_deref() {
        output["spec_id"] = serde_json::Value::String(did.to_string());
    }
    if let Some(session_name) = orchestration_tmux_session {
        output["tmux_session_name"] = serde_json::Value::String(session_name);
    }
    println!("{}", serde_json::to_string(&output)?);

    Ok(0)
}

/// Resolve the spec source to an absolute path, optional spec ID, and optional markdown.
///
/// When `--spec-doc` is provided, validates and canonicalizes the path.
/// When `--spec-id` is provided, fetches the spec from Convex and returns
/// a `convex://{id}` placeholder path along with the spec markdown (to avoid
/// re-fetching later).
fn resolve_spec_source(
    spec_doc: Option<&Path>,
    spec_id: Option<&str>,
) -> anyhow::Result<(std::path::PathBuf, Option<String>, Option<String>)> {
    if let Some(doc) = spec_doc {
        if !doc.exists() {
            anyhow::bail!(SessionError::FileNotFound(doc.display().to_string()));
        }
        let abs = fs::canonicalize(doc)?;
        Ok((abs, None, None))
    } else {
        let did = spec_id.expect("validated: exactly one source must be set");
        // Fetch spec from Convex (used for both validation and writing to worktree)
        let spec = convex::run_convex(|mut writer| async move { writer.get_spec(did).await })?;
        match spec {
            Some(d) => Ok((
                std::path::PathBuf::from(format!("convex://{}", did)),
                Some(did.to_string()),
                Some(d.markdown),
            )),
            None => anyhow::bail!("Spec not found in Convex: {}", did),
        }
    }
}

/// Write the spec document markdown to the worktree.
fn write_spec_to_worktree(worktree_path: &Path, markdown: &str) -> anyhow::Result<()> {
    let tina_dir = worktree_path.join(".claude").join("tina");
    fs::create_dir_all(&tina_dir)?;
    fs::write(tina_dir.join("spec.md"), markdown)?;
    Ok(())
}

fn parse_review_enforcement(value: &str) -> anyhow::Result<ReviewEnforcement> {
    match value {
        "task_and_phase" => Ok(ReviewEnforcement::TaskAndPhase),
        "task_only" => Ok(ReviewEnforcement::TaskOnly),
        "phase_only" => Ok(ReviewEnforcement::PhaseOnly),
        _ => anyhow::bail!(
            "invalid review_enforcement '{}', expected task_and_phase|task_only|phase_only",
            value
        ),
    }
}

fn parse_detector_scope(value: &str) -> anyhow::Result<DetectorScope> {
    match value {
        "whole_repo_pattern_index" => Ok(DetectorScope::WholeRepoPatternIndex),
        "touched_area_only" => Ok(DetectorScope::TouchedAreaOnly),
        "architectural_allowlist_only" => Ok(DetectorScope::ArchitecturalAllowlistOnly),
        _ => anyhow::bail!(
            "invalid detector_scope '{}', expected whole_repo_pattern_index|touched_area_only|architectural_allowlist_only",
            value
        ),
    }
}

fn parse_architect_mode(value: &str) -> anyhow::Result<ArchitectMode> {
    match value {
        "manual_only" => Ok(ArchitectMode::ManualOnly),
        "manual_plus_auto" => Ok(ArchitectMode::ManualPlusAuto),
        "disabled" => Ok(ArchitectMode::Disabled),
        _ => anyhow::bail!(
            "invalid architect_mode '{}', expected manual_only|manual_plus_auto|disabled",
            value
        ),
    }
}

fn parse_test_integrity_profile(value: &str) -> anyhow::Result<TestIntegrityProfile> {
    match value {
        "strict_baseline" => Ok(TestIntegrityProfile::StrictBaseline),
        "max_strict" => Ok(TestIntegrityProfile::MaxStrict),
        "minimal" => Ok(TestIntegrityProfile::Minimal),
        _ => anyhow::bail!(
            "invalid test_integrity_profile '{}', expected strict_baseline|max_strict|minimal",
            value
        ),
    }
}

fn apply_review_policy_overrides(
    state: &mut SupervisorState,
    review_enforcement: Option<&str>,
    detector_scope: Option<&str>,
    architect_mode: Option<&str>,
    test_integrity_profile: Option<&str>,
    hard_block_detectors: Option<bool>,
    allow_rare_override: Option<bool>,
    require_fix_first: Option<bool>,
) -> anyhow::Result<()> {
    if let Some(value) = review_enforcement {
        state.review_policy.enforcement = parse_review_enforcement(value)?;
    }

    if let Some(value) = detector_scope {
        state.review_policy.detector_scope = parse_detector_scope(value)?;
    }

    if let Some(value) = architect_mode {
        state.review_policy.architect_mode = parse_architect_mode(value)?;
    }

    if let Some(value) = test_integrity_profile {
        state.review_policy.test_integrity_profile = parse_test_integrity_profile(value)?;
    }

    if let Some(value) = hard_block_detectors {
        state.review_policy.hard_block_detectors = value;
    }

    if let Some(value) = allow_rare_override {
        state.review_policy.allow_rare_override = value;
    }

    if let Some(value) = require_fix_first {
        state.review_policy.require_fix_first = value;
    }

    Ok(())
}

/// Ensure a path is listed in .gitignore. Adds it if not already present.
fn ensure_gitignored(repo_root: &Path, entry: &str) -> anyhow::Result<()> {
    let output = Command::new("git")
        .args([
            "-C",
            &repo_root.to_string_lossy(),
            "check-ignore",
            "-q",
            entry,
        ])
        .output()?;

    if !output.status.success() {
        let gitignore = repo_root.join(".gitignore");
        let contents = if gitignore.exists() {
            fs::read_to_string(&gitignore)?
        } else {
            String::new()
        };

        // Check if entry is already in the file (even if git doesn't recognize it)
        if !contents.lines().any(|line| line.trim() == entry) {
            let mut new_contents = contents;
            if !new_contents.is_empty() && !new_contents.ends_with('\n') {
                new_contents.push('\n');
            }
            new_contents.push_str(entry);
            new_contents.push('\n');
            fs::write(&gitignore, new_contents)?;
        }
    }

    Ok(())
}

/// Create a git worktree. Returns the actual branch name used.
fn create_worktree(repo_root: &Path, worktree_path: &Path, branch: &str) -> anyhow::Result<String> {
    if worktree_path.exists() {
        anyhow::bail!(
            "Worktree path already exists: {}. Clean up or use a different feature name.",
            worktree_path.display()
        );
    }

    // Try to create worktree with the requested branch name
    let output = Command::new("git")
        .args([
            "-C",
            &repo_root.to_string_lossy(),
            "worktree",
            "add",
            &worktree_path.to_string_lossy(),
            "-b",
            branch,
        ])
        .output()?;

    if output.status.success() {
        return Ok(branch.to_string());
    }

    // Branch might exist already - try with timestamp suffix
    let timestamp = Utc::now().format("%Y%m%d%H%M%S");
    let unique_branch = format!("{}-{}", branch, timestamp);

    let output = Command::new("git")
        .args([
            "-C",
            &repo_root.to_string_lossy(),
            "worktree",
            "add",
            &worktree_path.to_string_lossy(),
            "-b",
            &unique_branch,
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("Failed to create git worktree: {}", stderr.trim());
    }

    Ok(unique_branch)
}

/// Write statusline config files into the worktree.
fn write_statusline_config(worktree_path: &Path) -> anyhow::Result<()> {
    let claude_dir = worktree_path.join(".claude");
    fs::create_dir_all(&claude_dir)?;

    // Write tina-write-context.sh
    let script_path = claude_dir.join("tina-write-context.sh");
    fs::write(&script_path, STATUSLINE_SCRIPT)?;
    fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))?;

    // Write settings.local.json with absolute path to the script
    let script_abs = script_path.to_string_lossy();
    let settings = format!(
        r#"{{"statusLine":{{"type":"command","command":"{}"}}}}"#,
        script_abs
    );
    let settings_path = claude_dir.join("settings.local.json");
    fs::write(&settings_path, settings)?;

    Ok(())
}

/// Generate an AGENTS.md file in the worktree from the project's CLAUDE.md.
/// Extracts project-relevant sections and excludes orchestration internals.
/// Best-effort: returns Ok(()) if CLAUDE.md is missing (no AGENTS.md created).
fn generate_agents_md(worktree_path: &Path) -> anyhow::Result<()> {
    let claude_md_path = worktree_path.join("CLAUDE.md");
    if !claude_md_path.exists() {
        return Ok(());
    }

    let contents = fs::read_to_string(&claude_md_path)?;
    let sections = extract_sections(&contents);

    if sections.is_empty() {
        return Ok(());
    }

    let mut output = String::from("# Project Context\n");
    for (heading, body) in &sections {
        output.push_str(&format!("\n## {}\n\n{}\n", heading, body.trim()));
    }

    fs::write(worktree_path.join("AGENTS.md"), output)?;
    Ok(())
}

/// Extract relevant sections from CLAUDE.md content.
/// Returns (heading, body) pairs for sections we want in AGENTS.md.
fn extract_sections(contents: &str) -> Vec<(String, String)> {
    let wanted = [
        "Project Overview",
        "Build & Development Commands",
        "Architecture",
        "Conventions",
    ];

    // Orchestration-internal keywords to filter out of extracted content
    let internal_keywords = [
        "worktree",
        "supervisor state",
        "tmux",
        "tina-session",
        "tina-daemon",
    ];

    let mut sections = Vec::new();
    let mut current_heading: Option<String> = None;
    let mut current_body = String::new();

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("## ") {
            // Flush previous section
            if let Some(heading) = current_heading.take() {
                if wanted.iter().any(|w| heading.contains(w)) {
                    let filtered = filter_internal_lines(&current_body, &internal_keywords);
                    if !filtered.trim().is_empty() {
                        sections.push((heading, filtered));
                    }
                }
            }
            current_heading = Some(trimmed.trim_start_matches('#').trim().to_string());
            current_body.clear();
        } else if current_heading.is_some() {
            current_body.push_str(line);
            current_body.push('\n');
        }
    }

    // Flush last section
    if let Some(heading) = current_heading {
        if wanted.iter().any(|w| heading.contains(w)) {
            let filtered = filter_internal_lines(&current_body, &internal_keywords);
            if !filtered.trim().is_empty() {
                sections.push((heading, filtered));
            }
        }
    }

    sections
}

/// Remove lines that contain orchestration-internal keywords.
fn filter_internal_lines(body: &str, keywords: &[&str]) -> String {
    body.lines()
        .filter(|line| {
            let lower = line.to_lowercase();
            !keywords.iter().any(|kw| lower.contains(kw))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn auto_start_daemon() {
    if tina_session::daemon::status().is_none() {
        match tina_session::daemon::start() {
            Ok(pid) => eprintln!("Auto-started daemon (pid {})", pid),
            Err(e) => eprintln!("Warning: Failed to auto-start daemon: {}", e),
        }
    }
}

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

fn start_orchestration_session(
    feature: &str,
    worktree_path: &Path,
    spec_id: Option<&str>,
    spec_doc_path: &Path,
) -> anyhow::Result<String> {
    let session_name = orchestration_session_name(feature);

    if tmux::session_exists(&session_name) {
        eprintln!(
            "Orchestration session '{}' already exists. Reusing.",
            session_name
        );
        return Ok(session_name);
    }

    if !worktree_path.exists() {
        anyhow::bail!(
            "orchestration worktree does not exist: {}",
            worktree_path.display()
        );
    }

    eprintln!(
        "Creating orchestration session '{}' in {}",
        session_name,
        worktree_path.display()
    );
    tmux::create_session(&session_name, worktree_path, None)?;
    std::thread::sleep(Duration::from_millis(500));

    let claude_bin = detect_claude_binary()?;
    let claude_cmd = format!(
        "{} --dangerously-skip-permissions",
        shell_quote(&claude_bin.to_string_lossy())
    );
    eprintln!("Starting Claude ({}) in orchestration session...", claude_bin.display());
    tmux::send_keys(&session_name, &claude_cmd)?;

    eprintln!(
        "Waiting for Claude to be ready in orchestration session (up to {}s)...",
        CLAUDE_READY_TIMEOUT_SECS
    );
    match claude::wait_for_ready(&session_name, CLAUDE_READY_TIMEOUT_SECS) {
        Ok(_) => {
            eprintln!("Claude is ready.");
        }
        Err(e) => {
            eprintln!("Warning: {}", e);
            eprintln!("Proceeding anyway, but Claude may not be ready.");
        }
    }

    let skill_cmd = if let Some(did) = spec_id {
        format!("/tina:orchestrate --feature {} --spec-id {}", feature, did)
    } else {
        format!(
            "/tina:orchestrate --feature {} {}",
            feature,
            spec_doc_path.display()
        )
    };
    eprintln!("Sending: {}", skill_cmd);
    tmux::send_keys(&session_name, &skill_cmd)?;

    Ok(session_name)
}

/// Pre-register the orchestration team in Convex so the daemon can resolve
/// the team-to-orchestration link when syncing team members and tasks.
fn register_orchestration_team(
    orchestration_id: &str,
    team_name: &str,
    tmux_session_name: Option<&str>,
) -> anyhow::Result<String> {
    let tmux_session_name = tmux_session_name.map(str::to_string);
    convex::run_convex(|mut writer| async move {
        let args = convex::RegisterTeamArgs {
            team_name: team_name.to_string(),
            orchestration_id: orchestration_id.to_string(),
            lead_session_id: "pending".to_string(),
            local_dir_name: team_name.replace('.', "-"),
            tmux_session_name,
            phase_number: None,
            parent_team_id: None,
            created_at: chrono::Utc::now().timestamp_millis() as f64,
        };
        writer.register_team(&args).await
    })
}

/// Check if an orchestration already exists for this feature via Convex.
fn check_existing_orchestration(
    feature: &str,
) -> anyhow::Result<Option<convex::OrchestrationRecord>> {
    convex::run_convex(|mut writer| async move { writer.get_by_feature(feature).await })
}

/// Write orchestration record to Convex via tina-data types.
/// Returns the Convex orchestration doc ID.
fn write_to_convex(
    feature: &str,
    worktree_path: &Path,
    spec_doc: &Path,
    branch: &str,
    total_phases: u32,
    cwd: &Path,
    spec_id: Option<&str>,
) -> anyhow::Result<String> {
    let now = chrono::Utc::now().to_rfc3339();
    let repo_name = cwd
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    let repo_path = cwd.to_string_lossy().to_string();
    let spec_id_owned = spec_id.map(|s| s.to_string());

    convex::run_convex(|mut writer| async move {
        let project_id = match writer.find_or_create_project(&repo_name, &repo_path).await {
            Ok(id) => Some(id),
            Err(e) => {
                eprintln!("Warning: Failed to find/create project: {}", e);
                None
            }
        };

        let orch = convex::OrchestrationArgs {
            node_id: writer.node_id().to_string(),
            project_id,
            spec_id: spec_id_owned,
            feature_name: feature.to_string(),
            spec_doc_path: spec_doc.to_string_lossy().to_string(),
            branch: branch.to_string(),
            worktree_path: Some(worktree_path.to_string_lossy().to_string()),
            total_phases: total_phases as f64,
            current_phase: 1.0,
            status: "planning".to_string(),
            started_at: now,
            completed_at: None,
            total_elapsed_mins: None,
            policy_snapshot: None,
            policy_snapshot_hash: None,
            preset_origin: None,
            spec_only: None,
            policy_revision: None,
            updated_at: None,
        };
        let orch_id = writer.upsert_orchestration(&orch).await?;
        Ok(orch_id)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn convex_available() -> bool {
        match tina_session::config::load_config() {
            Ok(cfg) => {
                cfg.convex_url.as_deref().unwrap_or_default().is_empty() == false
                    && cfg.auth_token.as_deref().unwrap_or_default().is_empty() == false
            }
            Err(_) => false,
        }
    }

    /// Create a temporary git repo for testing.
    fn create_test_repo() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        let cwd = temp_dir.path();

        Command::new("git")
            .args(["init", &cwd.to_string_lossy()])
            .output()
            .unwrap();

        // Need at least one commit for worktree to work
        Command::new("git")
            .args([
                "-C",
                &cwd.to_string_lossy(),
                "commit",
                "--allow-empty",
                "-m",
                "init",
            ])
            .output()
            .unwrap();

        temp_dir
    }

    #[test]
    fn test_init_creates_worktree_and_files() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        // Create a fake spec doc
        let spec_doc = cwd.join("spec.md");
        fs::write(&spec_doc, "# Design").unwrap();

        let feature = format!("test-init-{}", std::process::id());

        let result = run(
            &feature,
            cwd,
            Some(&spec_doc),
            None,
            "tina/test",
            3,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert!(result.is_ok());

        // Verify worktree was created
        let worktree_path = cwd.join(".worktrees").join(&feature);
        assert!(worktree_path.exists(), "Worktree directory should exist");
        assert!(worktree_path.is_dir(), "Worktree should be a directory");

        // Verify statusline files
        let script = worktree_path.join(".claude").join("tina-write-context.sh");
        assert!(script.exists(), "Statusline script should exist");
        let perms = fs::metadata(&script).unwrap().permissions();
        assert!(perms.mode() & 0o111 != 0, "Script should be executable");

        let settings = worktree_path.join(".claude").join("settings.local.json");
        assert!(settings.exists(), "Settings file should exist");

        // Clean up worktree
        let _ = Command::new("git")
            .args([
                "-C",
                &cwd.to_string_lossy(),
                "worktree",
                "remove",
                "--force",
                &worktree_path.to_string_lossy(),
            ])
            .output();
    }

    #[test]
    fn test_init_gitignores_worktrees() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        let spec_doc = cwd.join("spec.md");
        fs::write(&spec_doc, "# Design").unwrap();

        let feature = format!("test-gitignore-{}", std::process::id());
        let result = run(
            &feature,
            cwd,
            Some(&spec_doc),
            None,
            "tina/test",
            2,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        // worktree cleanup below
        assert!(result.is_ok());

        // Check .gitignore contains .worktrees
        let gitignore = cwd.join(".gitignore");
        assert!(gitignore.exists(), ".gitignore should exist");
        let contents = fs::read_to_string(&gitignore).unwrap();
        assert!(
            contents.contains(".worktrees"),
            ".gitignore should contain .worktrees"
        );

        // Clean up worktree
        let worktree_path = cwd.join(".worktrees").join(&feature);
        let _ = Command::new("git")
            .args([
                "-C",
                &cwd.to_string_lossy(),
                "worktree",
                "remove",
                "--force",
                &worktree_path.to_string_lossy(),
            ])
            .output();
    }

    #[test]
    fn test_init_branch_collision_appends_timestamp() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        let spec_doc = cwd.join("spec.md");
        fs::write(&spec_doc, "# Design").unwrap();

        // Create a branch that will collide
        Command::new("git")
            .args([
                "-C",
                &cwd.to_string_lossy(),
                "branch",
                "tina/collision-test",
            ])
            .output()
            .unwrap();

        let feature = format!("collision-{}", std::process::id());
        let result = run(
            &feature,
            cwd,
            Some(&spec_doc),
            None,
            "tina/collision-test",
            1,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        // worktree cleanup below
        assert!(result.is_ok());

        // Verify worktree was still created (with unique branch)
        let worktree_path = cwd.join(".worktrees").join(&feature);
        assert!(
            worktree_path.exists(),
            "Worktree should exist despite branch collision"
        );

        // Clean up worktree
        let _ = Command::new("git")
            .args([
                "-C",
                &cwd.to_string_lossy(),
                "worktree",
                "remove",
                "--force",
                &worktree_path.to_string_lossy(),
            ])
            .output();
    }

    #[test]
    fn test_init_validates_cwd() {
        let result = run(
            "test-bad-cwd",
            Path::new("/nonexistent/path"),
            Some(Path::new("/tmp/spec.md")),
            None,
            "tina/test",
            3,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_init_validates_spec_doc() {
        let temp_dir = TempDir::new().unwrap();
        let result = run(
            "test-bad-doc",
            temp_dir.path(),
            Some(Path::new("/nonexistent/spec.md")),
            None,
            "tina/test",
            3,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_ensure_gitignored_creates_file() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path();

        // Init a git repo so git check-ignore works
        Command::new("git")
            .args(["init", &path.to_string_lossy()])
            .output()
            .unwrap();

        ensure_gitignored(path, ".worktrees").unwrap();

        let gitignore = path.join(".gitignore");
        assert!(gitignore.exists());
        let contents = fs::read_to_string(&gitignore).unwrap();
        assert!(contents.contains(".worktrees"));
    }

    #[test]
    fn test_ensure_gitignored_idempotent() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path();

        Command::new("git")
            .args(["init", &path.to_string_lossy()])
            .output()
            .unwrap();

        ensure_gitignored(path, ".worktrees").unwrap();
        ensure_gitignored(path, ".worktrees").unwrap();

        let contents = fs::read_to_string(path.join(".gitignore")).unwrap();
        let count = contents
            .lines()
            .filter(|l| l.trim() == ".worktrees")
            .count();
        assert_eq!(count, 1, "Should only have one .worktrees entry");
    }

    #[test]
    fn test_generate_agents_md_from_claude_md() {
        let temp = TempDir::new().unwrap();
        let worktree = temp.path();

        let claude_md = r#"# CLAUDE.md

## Project Overview

TINA is a workflow system.

## Build & Development Commands

```bash
cargo build
cargo test
```

## Architecture

Mixed Rust/TypeScript monorepo.

## Conventions

- Features are kebab-case.
"#;
        fs::write(worktree.join("CLAUDE.md"), claude_md).unwrap();
        generate_agents_md(worktree).unwrap();

        let agents_md = worktree.join("AGENTS.md");
        assert!(agents_md.exists(), "AGENTS.md should be created");

        let content = fs::read_to_string(&agents_md).unwrap();
        assert!(content.contains("# Project Context"));
        assert!(content.contains("## Project Overview"));
        assert!(content.contains("## Build & Development Commands"));
        assert!(content.contains("## Architecture"));
        assert!(content.contains("## Conventions"));
        assert!(content.contains("cargo build"));
    }

    #[test]
    fn test_generate_agents_md_missing_claude_md() {
        let temp = TempDir::new().unwrap();
        let worktree = temp.path();

        // No CLAUDE.md exists
        let result = generate_agents_md(worktree);
        assert!(result.is_ok(), "Should succeed silently");
        assert!(
            !worktree.join("AGENTS.md").exists(),
            "AGENTS.md should not be created"
        );
    }

    #[test]
    fn test_generate_agents_md_partial_claude_md() {
        let temp = TempDir::new().unwrap();
        let worktree = temp.path();

        let claude_md = r#"# CLAUDE.md

## Project Overview

A simple project.

## Some Other Section

Not relevant.
"#;
        fs::write(worktree.join("CLAUDE.md"), claude_md).unwrap();
        generate_agents_md(worktree).unwrap();

        let agents_md = worktree.join("AGENTS.md");
        assert!(
            agents_md.exists(),
            "AGENTS.md should be created with partial content"
        );

        let content = fs::read_to_string(&agents_md).unwrap();
        assert!(content.contains("## Project Overview"));
        assert!(!content.contains("Some Other Section"));
    }

    #[test]
    fn test_generate_agents_md_does_not_include_orchestration_internals() {
        let temp = TempDir::new().unwrap();
        let worktree = temp.path();

        let claude_md = r#"# CLAUDE.md

## Project Overview

A project that uses worktree isolation.
Clean line about the project.

## Architecture

Uses tmux for session management.
Clean architecture description.
tina-session handles lifecycle.
tina-daemon watches files.
Supervisor state tracks progress.
"#;
        fs::write(worktree.join("CLAUDE.md"), claude_md).unwrap();
        generate_agents_md(worktree).unwrap();

        let agents_md = worktree.join("AGENTS.md");
        assert!(agents_md.exists());

        let content = fs::read_to_string(&agents_md).unwrap();
        assert!(
            !content.contains("worktree"),
            "Should not contain 'worktree'"
        );
        assert!(!content.contains("tmux"), "Should not contain 'tmux'");
        assert!(
            !content.contains("tina-session"),
            "Should not contain 'tina-session'"
        );
        assert!(
            !content.contains("tina-daemon"),
            "Should not contain 'tina-daemon'"
        );
        assert!(
            !content.contains("Supervisor state"),
            "Should not contain 'supervisor state'"
        );
        assert!(content.contains("Clean line about the project"));
        assert!(content.contains("Clean architecture description"));
    }

    #[test]
    fn test_write_statusline_config() {
        let temp_dir = TempDir::new().unwrap();
        let worktree = temp_dir.path();

        write_statusline_config(worktree).unwrap();

        let script = worktree.join(".claude").join("tina-write-context.sh");
        assert!(script.exists());
        let perms = fs::metadata(&script).unwrap().permissions();
        assert!(perms.mode() & 0o111 != 0, "Script should be executable");

        let settings = worktree.join(".claude").join("settings.local.json");
        assert!(settings.exists());
        let settings_content = fs::read_to_string(&settings).unwrap();
        assert!(settings_content.contains("statusLine"));
        assert!(settings_content.contains("tina-write-context.sh"));
    }

    #[test]
    fn test_apply_review_policy_overrides() {
        let mut state = SupervisorState::new(
            "feature",
            Path::new("/tmp/spec.md").to_path_buf(),
            Path::new("/tmp/worktree").to_path_buf(),
            "tina/feature",
            2,
        );

        apply_review_policy_overrides(
            &mut state,
            Some("task_only"),
            Some("touched_area_only"),
            Some("manual_only"),
            Some("minimal"),
            Some(false),
            Some(false),
            Some(false),
        )
        .unwrap();

        assert_eq!(state.review_policy.enforcement, ReviewEnforcement::TaskOnly);
        assert_eq!(
            state.review_policy.detector_scope,
            DetectorScope::TouchedAreaOnly
        );
        assert_eq!(
            state.review_policy.architect_mode,
            ArchitectMode::ManualOnly
        );
        assert_eq!(
            state.review_policy.test_integrity_profile,
            TestIntegrityProfile::Minimal
        );
        assert!(!state.review_policy.hard_block_detectors);
        assert!(!state.review_policy.allow_rare_override);
        assert!(!state.review_policy.require_fix_first);
    }

    #[test]
    fn test_write_spec_to_worktree() {
        let temp = TempDir::new().unwrap();
        let worktree = temp.path();

        let markdown = "# My Design\n\nSome design content.";
        write_spec_to_worktree(worktree, markdown).unwrap();

        let spec_path = worktree.join(".claude").join("tina").join("spec.md");
        assert!(spec_path.exists(), "spec.md should be written");
        let content = fs::read_to_string(&spec_path).unwrap();
        assert_eq!(content, markdown);
    }

    #[test]
    fn test_write_spec_to_worktree_creates_directories() {
        let temp = TempDir::new().unwrap();
        let worktree = temp.path();

        // .claude/tina/ doesn't exist yet
        assert!(!worktree.join(".claude").exists());

        write_spec_to_worktree(worktree, "# Test").unwrap();

        assert!(worktree.join(".claude").join("tina").exists());
        assert!(worktree
            .join(".claude")
            .join("tina")
            .join("spec.md")
            .exists());
    }

    #[test]
    fn test_resolve_spec_source_with_local_file() {
        let temp = TempDir::new().unwrap();
        let doc = temp.path().join("spec.md");
        fs::write(&doc, "# Design").unwrap();

        let (path, spec_id, markdown) = resolve_spec_source(Some(doc.as_path()), None).unwrap();

        assert_eq!(path, fs::canonicalize(&doc).unwrap());
        assert!(spec_id.is_none());
        assert!(markdown.is_none());
    }

    #[test]
    fn test_resolve_spec_source_rejects_missing_file() {
        let result = resolve_spec_source(Some(Path::new("/nonexistent/spec.md")), None);
        assert!(result.is_err());
    }

    #[test]
    fn test_init_spec_doc_backward_compatible() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        let spec_doc = cwd.join("spec.md");
        fs::write(&spec_doc, "# Backward Compat Test").unwrap();

        let feature = format!("test-compat-{}", std::process::id());

        let result = run(
            &feature,
            cwd,
            Some(&spec_doc),
            None,
            "tina/test-compat",
            2,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert!(
            result.is_ok(),
            "init with --spec-doc should still work: {:?}",
            result.err()
        );

        // Verify worktree was created
        let worktree_path = cwd.join(".worktrees").join(&feature);
        assert!(worktree_path.exists());

        // Verify supervisor state has no spec_id
        let state_path = worktree_path
            .join(".claude")
            .join("tina")
            .join("supervisor-state.json");
        assert!(state_path.exists(), "supervisor state should exist");
        let state_json = fs::read_to_string(&state_path).unwrap();
        let state: serde_json::Value = serde_json::from_str(&state_json).unwrap();
        assert!(
            state.get("spec_id").is_none() || state["spec_id"].is_null(),
            "spec_id should be absent or null for --spec-doc path"
        );

        // Verify no spec.md was written (only happens with --spec-id)
        let spec_md = worktree_path.join(".claude").join("tina").join("spec.md");
        assert!(
            !spec_md.exists(),
            "spec.md should NOT be written when using --spec-doc"
        );

        // Clean up worktree
        let _ = Command::new("git")
            .args([
                "-C",
                &cwd.to_string_lossy(),
                "worktree",
                "remove",
                "--force",
                &worktree_path.to_string_lossy(),
            ])
            .output();
    }

    #[test]
    fn test_init_with_spec_id_creates_worktree() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        // First, create a project and spec in Convex
        let (project_id, spec_id) = match create_test_spec() {
            Ok(ids) => ids,
            Err(e) => {
                eprintln!("Skipping test: could not create test spec: {}", e);
                return;
            }
        };

        let _ = project_id; // used in setup, not needed directly

        let feature = format!("test-specid-{}", std::process::id());

        let result = run(
            &feature,
            cwd,
            None,
            Some(&spec_id),
            "tina/test-specid",
            2,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert!(
            result.is_ok(),
            "init with --spec-id should succeed: {:?}",
            result.err()
        );

        // Verify worktree was created
        let worktree_path = cwd.join(".worktrees").join(&feature);
        assert!(worktree_path.exists(), "Worktree directory should exist");

        // Verify spec.md was written to worktree
        let spec_md = worktree_path.join(".claude").join("tina").join("spec.md");
        assert!(
            spec_md.exists(),
            "spec.md should be written when using --spec-id"
        );
        let spec_content = fs::read_to_string(&spec_md).unwrap();
        assert!(!spec_content.is_empty(), "spec.md should have content");

        // Verify supervisor state has spec_id
        let state_path = worktree_path
            .join(".claude")
            .join("tina")
            .join("supervisor-state.json");
        assert!(state_path.exists(), "supervisor state should exist");
        let state_json = fs::read_to_string(&state_path).unwrap();
        let state: serde_json::Value = serde_json::from_str(&state_json).unwrap();
        assert_eq!(
            state["spec_id"].as_str().unwrap(),
            spec_id,
            "supervisor state should store spec_id"
        );
        // spec_doc should be the convex:// placeholder
        let spec_doc_val = state["spec_doc"].as_str().unwrap();
        assert!(
            spec_doc_val.starts_with("convex://"),
            "spec_doc should be convex:// placeholder, got: {}",
            spec_doc_val
        );

        // Clean up worktree
        let _ = Command::new("git")
            .args([
                "-C",
                &cwd.to_string_lossy(),
                "worktree",
                "remove",
                "--force",
                &worktree_path.to_string_lossy(),
            ])
            .output();
    }

    /// Helper to create a test spec in Convex. Returns (project_id, spec_id).
    fn create_test_spec() -> anyhow::Result<(String, String)> {
        convex::run_convex(|mut writer| async move {
            let project_id = writer
                .find_or_create_project("test-project", "/tmp/test-project")
                .await?;
            let spec_id = writer
                .create_spec(&project_id, "Test Design", "# Test Design\n\nTest content.")
                .await?;
            Ok((project_id, spec_id))
        })
    }

    #[test]
    fn test_init_rejects_both_spec_doc_and_spec_id() {
        let temp_dir = TempDir::new().unwrap();
        let spec_doc = temp_dir.path().join("spec.md");
        fs::write(&spec_doc, "# Design").unwrap();

        let result = run(
            "test-both",
            temp_dir.path(),
            Some(&spec_doc),
            Some("some-spec-id"),
            "tina/test",
            1,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("Cannot specify both"),
            "Expected 'Cannot specify both' error, got: {}",
            err
        );
    }

    #[test]
    fn test_init_rejects_neither_spec_doc_nor_spec_id() {
        let temp_dir = TempDir::new().unwrap();

        let result = run(
            "test-neither",
            temp_dir.path(),
            None,
            None,
            "tina/test",
            1,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("Must specify either"),
            "Expected 'Must specify either' error, got: {}",
            err
        );
    }
}
