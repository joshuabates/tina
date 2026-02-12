use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

use chrono::Utc;

use tina_session::error::SessionError;
use tina_session::state::schema::{
    ArchitectMode, DetectorScope, ReviewEnforcement, SupervisorState, TestIntegrityProfile,
};

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

pub fn run(
    feature: &str,
    cwd: &Path,
    design_doc: Option<&Path>,
    design_id: Option<&str>,
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
    // Validate exactly one design source
    match (design_doc, design_id) {
        (Some(_), Some(_)) => anyhow::bail!("Cannot specify both --design-doc and --design-id"),
        (None, None) => anyhow::bail!("Must specify either --design-doc or --design-id"),
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

    // Resolve design source: either a local file or a Convex design ID
    let (design_doc_path, resolved_design_id, design_markdown) =
        resolve_design_source(design_doc, design_id)?;

    // Check if already initialized via Convex (only block on active orchestrations)
    if let Some(existing) = check_existing_orchestration(feature)? {
        let is_terminal = existing.status == "complete" || existing.status == "blocked";
        if !is_terminal {
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

    // When using --design-id, write design markdown to worktree for local access
    if let Some(markdown) = design_markdown.as_deref() {
        write_design_to_worktree(&worktree_path, markdown)?;
    }

    // Create supervisor state file in worktree
    let mut state = if let Some(did) = resolved_design_id.as_deref() {
        SupervisorState::new_with_design_id(
            feature,
            worktree_path.clone(),
            &actual_branch,
            total_phases,
            did,
        )
    } else {
        SupervisorState::new(
            feature,
            design_doc_path.clone(),
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
        &design_doc_path,
        &actual_branch,
        total_phases,
        &cwd_abs,
        resolved_design_id.as_deref(),
    )?;

    // Pre-register the orchestration team in Convex so the daemon can link
    // teams/tasks to this orchestration. The lead_session_id is a placeholder
    // until the real team lead starts and re-registers via upsert.
    let team_name = format!("{}-orchestration", feature);
    let team_id = register_orchestration_team(&orch_id, &team_name)?;

    // Auto-start daemon if not running
    if tina_session::daemon::status().is_none() {
        match tina_session::daemon::start() {
            Ok(pid) => eprintln!("Auto-started daemon (pid {})", pid),
            Err(e) => eprintln!("Warning: Failed to auto-start daemon: {}", e),
        }
    }

    // Output JSON for orchestrator to capture
    let mut output = serde_json::json!({
        "orchestration_id": orch_id,
        "team_id": team_id,
        "worktree_path": worktree_path.display().to_string(),
        "feature": feature,
        "branch": actual_branch,
        "design_doc": design_doc_path.display().to_string(),
        "total_phases": total_phases,
    });
    if let Some(did) = resolved_design_id.as_deref() {
        output["design_id"] = serde_json::Value::String(did.to_string());
    }
    println!("{}", serde_json::to_string(&output)?);

    Ok(0)
}

/// Resolve the design source to an absolute path, optional design ID, and optional markdown.
///
/// When `--design-doc` is provided, validates and canonicalizes the path.
/// When `--design-id` is provided, fetches the design from Convex and returns
/// a `convex://{id}` placeholder path along with the design markdown (to avoid
/// re-fetching later).
fn resolve_design_source(
    design_doc: Option<&Path>,
    design_id: Option<&str>,
) -> anyhow::Result<(std::path::PathBuf, Option<String>, Option<String>)> {
    if let Some(doc) = design_doc {
        if !doc.exists() {
            anyhow::bail!(SessionError::FileNotFound(doc.display().to_string()));
        }
        let abs = fs::canonicalize(doc)?;
        Ok((abs, None, None))
    } else {
        let did = design_id.expect("validated: exactly one source must be set");
        // Fetch design from Convex (used for both validation and writing to worktree)
        let design = convex::run_convex(|mut writer| async move {
            writer.get_design(did).await
        })?;
        match design {
            Some(d) => Ok((
                std::path::PathBuf::from(format!("convex://{}", did)),
                Some(did.to_string()),
                Some(d.markdown),
            )),
            None => anyhow::bail!("Design not found in Convex: {}", did),
        }
    }
}

/// Write the design document markdown to the worktree.
fn write_design_to_worktree(worktree_path: &Path, markdown: &str) -> anyhow::Result<()> {
    let tina_dir = worktree_path.join(".claude").join("tina");
    fs::create_dir_all(&tina_dir)?;
    fs::write(tina_dir.join("design.md"), markdown)?;
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
        .args(["-C", &repo_root.to_string_lossy(), "check-ignore", "-q", entry])
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
    let internal_keywords = ["worktree", "supervisor state", "tmux", "tina-session", "tina-daemon"];

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

/// Pre-register the orchestration team in Convex so the daemon can resolve
/// the team-to-orchestration link when syncing team members and tasks.
fn register_orchestration_team(orchestration_id: &str, team_name: &str) -> anyhow::Result<String> {
    convex::run_convex(|mut writer| async move {
        let args = convex::RegisterTeamArgs {
            team_name: team_name.to_string(),
            orchestration_id: orchestration_id.to_string(),
            lead_session_id: "pending".to_string(),
            tmux_session_name: None,
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
    convex::run_convex(|mut writer| async move {
        writer.get_by_feature(feature).await
    })
}

/// Write orchestration record to Convex via tina-data types.
/// Returns the Convex orchestration doc ID.
fn write_to_convex(
    feature: &str,
    worktree_path: &Path,
    design_doc: &Path,
    branch: &str,
    total_phases: u32,
    cwd: &Path,
    design_id: Option<&str>,
) -> anyhow::Result<String> {
    let now = chrono::Utc::now().to_rfc3339();
    let repo_name = cwd
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    let repo_path = cwd.to_string_lossy().to_string();
    let design_id_owned = design_id.map(|s| s.to_string());

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
            design_id: design_id_owned,
            feature_name: feature.to_string(),
            design_doc_path: design_doc.to_string_lossy().to_string(),
            branch: branch.to_string(),
            worktree_path: Some(worktree_path.to_string_lossy().to_string()),
            total_phases: total_phases as f64,
            current_phase: 1.0,
            status: "planning".to_string(),
            started_at: now,
            completed_at: None,
            total_elapsed_mins: None,
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
            .args(["-C", &cwd.to_string_lossy(), "commit", "--allow-empty", "-m", "init"])
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

        // Create a fake design doc
        let design_doc = cwd.join("design.md");
        fs::write(&design_doc, "# Design").unwrap();

        let feature = format!("test-init-{}", std::process::id());

        let result = run(
            &feature,
            cwd,
            Some(&design_doc),
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
            .args(["-C", &cwd.to_string_lossy(), "worktree", "remove", "--force", &worktree_path.to_string_lossy()])
            .output();
    }

    #[test]
    fn test_init_gitignores_worktrees() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        let design_doc = cwd.join("design.md");
        fs::write(&design_doc, "# Design").unwrap();

        let feature = format!("test-gitignore-{}", std::process::id());
        let result = run(
            &feature,
            cwd,
            Some(&design_doc),
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
        assert!(contents.contains(".worktrees"), ".gitignore should contain .worktrees");

        // Clean up worktree
        let worktree_path = cwd.join(".worktrees").join(&feature);
        let _ = Command::new("git")
            .args(["-C", &cwd.to_string_lossy(), "worktree", "remove", "--force", &worktree_path.to_string_lossy()])
            .output();
    }

    #[test]
    fn test_init_branch_collision_appends_timestamp() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        let design_doc = cwd.join("design.md");
        fs::write(&design_doc, "# Design").unwrap();

        // Create a branch that will collide
        Command::new("git")
            .args(["-C", &cwd.to_string_lossy(), "branch", "tina/collision-test"])
            .output()
            .unwrap();

        let feature = format!("collision-{}", std::process::id());
        let result = run(
            &feature,
            cwd,
            Some(&design_doc),
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
        assert!(worktree_path.exists(), "Worktree should exist despite branch collision");

        // Clean up worktree
        let _ = Command::new("git")
            .args(["-C", &cwd.to_string_lossy(), "worktree", "remove", "--force", &worktree_path.to_string_lossy()])
            .output();
    }

    #[test]
    fn test_init_validates_cwd() {
        let result = run(
            "test-bad-cwd",
            Path::new("/nonexistent/path"),
            Some(Path::new("/tmp/design.md")),
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
    fn test_init_validates_design_doc() {
        let temp_dir = TempDir::new().unwrap();
        let result = run(
            "test-bad-doc",
            temp_dir.path(),
            Some(Path::new("/nonexistent/design.md")),
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
        let count = contents.lines().filter(|l| l.trim() == ".worktrees").count();
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
        assert!(!worktree.join("AGENTS.md").exists(), "AGENTS.md should not be created");
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
        assert!(agents_md.exists(), "AGENTS.md should be created with partial content");

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
        assert!(!content.contains("worktree"), "Should not contain 'worktree'");
        assert!(!content.contains("tmux"), "Should not contain 'tmux'");
        assert!(!content.contains("tina-session"), "Should not contain 'tina-session'");
        assert!(!content.contains("tina-daemon"), "Should not contain 'tina-daemon'");
        assert!(!content.contains("Supervisor state"), "Should not contain 'supervisor state'");
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
            Path::new("/tmp/design.md").to_path_buf(),
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
        assert_eq!(state.review_policy.architect_mode, ArchitectMode::ManualOnly);
        assert_eq!(
            state.review_policy.test_integrity_profile,
            TestIntegrityProfile::Minimal
        );
        assert!(!state.review_policy.hard_block_detectors);
        assert!(!state.review_policy.allow_rare_override);
        assert!(!state.review_policy.require_fix_first);
    }

    #[test]
    fn test_write_design_to_worktree() {
        let temp = TempDir::new().unwrap();
        let worktree = temp.path();

        let markdown = "# My Design\n\nSome design content.";
        write_design_to_worktree(worktree, markdown).unwrap();

        let design_path = worktree.join(".claude").join("tina").join("design.md");
        assert!(design_path.exists(), "design.md should be written");
        let content = fs::read_to_string(&design_path).unwrap();
        assert_eq!(content, markdown);
    }

    #[test]
    fn test_write_design_to_worktree_creates_directories() {
        let temp = TempDir::new().unwrap();
        let worktree = temp.path();

        // .claude/tina/ doesn't exist yet
        assert!(!worktree.join(".claude").exists());

        write_design_to_worktree(worktree, "# Test").unwrap();

        assert!(worktree.join(".claude").join("tina").exists());
        assert!(worktree.join(".claude").join("tina").join("design.md").exists());
    }

    #[test]
    fn test_resolve_design_source_with_local_file() {
        let temp = TempDir::new().unwrap();
        let doc = temp.path().join("design.md");
        fs::write(&doc, "# Design").unwrap();

        let (path, design_id, markdown) =
            resolve_design_source(Some(doc.as_path()), None).unwrap();

        assert_eq!(path, fs::canonicalize(&doc).unwrap());
        assert!(design_id.is_none());
        assert!(markdown.is_none());
    }

    #[test]
    fn test_resolve_design_source_rejects_missing_file() {
        let result = resolve_design_source(Some(Path::new("/nonexistent/design.md")), None);
        assert!(result.is_err());
    }

    #[test]
    fn test_init_design_doc_backward_compatible() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        let design_doc = cwd.join("design.md");
        fs::write(&design_doc, "# Backward Compat Test").unwrap();

        let feature = format!("test-compat-{}", std::process::id());

        let result = run(
            &feature,
            cwd,
            Some(&design_doc),
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

        assert!(result.is_ok(), "init with --design-doc should still work: {:?}", result.err());

        // Verify worktree was created
        let worktree_path = cwd.join(".worktrees").join(&feature);
        assert!(worktree_path.exists());

        // Verify supervisor state has no design_id
        let state_path = worktree_path
            .join(".claude")
            .join("tina")
            .join("supervisor-state.json");
        assert!(state_path.exists(), "supervisor state should exist");
        let state_json = fs::read_to_string(&state_path).unwrap();
        let state: serde_json::Value = serde_json::from_str(&state_json).unwrap();
        assert!(
            state.get("design_id").is_none()
                || state["design_id"].is_null(),
            "design_id should be absent or null for --design-doc path"
        );

        // Verify no design.md was written (only happens with --design-id)
        let design_md = worktree_path.join(".claude").join("tina").join("design.md");
        assert!(!design_md.exists(), "design.md should NOT be written when using --design-doc");

        // Clean up worktree
        let _ = Command::new("git")
            .args(["-C", &cwd.to_string_lossy(), "worktree", "remove", "--force", &worktree_path.to_string_lossy()])
            .output();
    }

    #[test]
    fn test_init_with_design_id_creates_worktree() {
        if !convex_available() {
            return;
        }

        let temp_dir = create_test_repo();
        let cwd = temp_dir.path();

        // First, create a project and design in Convex
        let (project_id, design_id) = match create_test_design() {
            Ok(ids) => ids,
            Err(e) => {
                eprintln!("Skipping test: could not create test design: {}", e);
                return;
            }
        };

        let _ = project_id; // used in setup, not needed directly

        let feature = format!("test-designid-{}", std::process::id());

        let result = run(
            &feature,
            cwd,
            None,
            Some(&design_id),
            "tina/test-designid",
            2,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        assert!(result.is_ok(), "init with --design-id should succeed: {:?}", result.err());

        // Verify worktree was created
        let worktree_path = cwd.join(".worktrees").join(&feature);
        assert!(worktree_path.exists(), "Worktree directory should exist");

        // Verify design.md was written to worktree
        let design_md = worktree_path.join(".claude").join("tina").join("design.md");
        assert!(design_md.exists(), "design.md should be written when using --design-id");
        let design_content = fs::read_to_string(&design_md).unwrap();
        assert!(!design_content.is_empty(), "design.md should have content");

        // Verify supervisor state has design_id
        let state_path = worktree_path
            .join(".claude")
            .join("tina")
            .join("supervisor-state.json");
        assert!(state_path.exists(), "supervisor state should exist");
        let state_json = fs::read_to_string(&state_path).unwrap();
        let state: serde_json::Value = serde_json::from_str(&state_json).unwrap();
        assert_eq!(
            state["design_id"].as_str().unwrap(),
            design_id,
            "supervisor state should store design_id"
        );
        // design_doc should be the convex:// placeholder
        let design_doc_val = state["design_doc"].as_str().unwrap();
        assert!(
            design_doc_val.starts_with("convex://"),
            "design_doc should be convex:// placeholder, got: {}",
            design_doc_val
        );

        // Clean up worktree
        let _ = Command::new("git")
            .args(["-C", &cwd.to_string_lossy(), "worktree", "remove", "--force", &worktree_path.to_string_lossy()])
            .output();
    }

    /// Helper to create a test design in Convex. Returns (project_id, design_id).
    fn create_test_design() -> anyhow::Result<(String, String)> {
        convex::run_convex(|mut writer| async move {
            let project_id = writer
                .find_or_create_project("test-project", "/tmp/test-project")
                .await?;
            let design_id = writer
                .create_design(&project_id, "Test Design", "# Test Design\n\nTest content.")
                .await?;
            Ok((project_id, design_id))
        })
    }

    #[test]
    fn test_init_rejects_both_design_doc_and_design_id() {
        let temp_dir = TempDir::new().unwrap();
        let design_doc = temp_dir.path().join("design.md");
        fs::write(&design_doc, "# Design").unwrap();

        let result = run(
            "test-both",
            temp_dir.path(),
            Some(&design_doc),
            Some("some-design-id"),
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
    fn test_init_rejects_neither_design_doc_nor_design_id() {
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
