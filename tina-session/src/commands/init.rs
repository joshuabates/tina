use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

use chrono::Utc;

use tina_session::error::SessionError;
use tina_session::session::lookup::SessionLookup;
use tina_session::state::schema::SupervisorState;

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
    design_doc: &Path,
    branch: &str,
    total_phases: u32,
) -> anyhow::Result<u8> {
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

    // Validate design doc exists
    if !design_doc.exists() {
        anyhow::bail!(SessionError::FileNotFound(design_doc.display().to_string()));
    }

    // Check if already initialized
    if SessionLookup::exists(feature) {
        let existing = SessionLookup::load(feature)?;
        anyhow::bail!(SessionError::AlreadyInitialized(
            feature.to_string(),
            existing.worktree_path.display().to_string()
        ));
    }

    let cwd_abs = fs::canonicalize(cwd)?;
    let design_doc_abs = fs::canonicalize(design_doc)?;

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

    // Create SessionLookup pointing to the worktree and repo root
    let lookup = SessionLookup::new(feature, worktree_path.clone(), cwd_abs.clone());
    lookup.save()?;

    // Create supervisor state in Convex
    let state = SupervisorState::new(
        feature,
        design_doc_abs.clone(),
        worktree_path.clone(),
        &actual_branch,
        total_phases,
    );
    state.save()?;

    // Write orchestration record to Convex (non-fatal)
    if let Err(e) = write_to_convex(
        feature,
        &worktree_path,
        &design_doc_abs,
        &actual_branch,
        total_phases,
        &cwd_abs,
    ) {
        eprintln!("Warning: Failed to write to Convex: {}", e);
    }

    // Auto-start daemon if not running
    if tina_session::daemon::status().is_none() {
        match tina_session::daemon::start() {
            Ok(pid) => eprintln!("Auto-started daemon (pid {})", pid),
            Err(e) => eprintln!("Warning: Failed to auto-start daemon: {}", e),
        }
    }

    // Print worktree path for orchestrator to capture
    println!("{}", worktree_path.display());

    Ok(0)
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

/// Write orchestration record to Convex via tina-data types.
fn write_to_convex(
    feature: &str,
    worktree_path: &Path,
    design_doc: &Path,
    branch: &str,
    total_phases: u32,
    cwd: &Path,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let repo_name = cwd
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    let repo_path = cwd.to_string_lossy().to_string();

    convex::run_convex_write(|mut writer| async move {
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
        writer.upsert_orchestration(&orch).await?;
        Ok(())
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

        let result = run(&feature, cwd, &design_doc, "tina/test", 3);

        // Clean up lookup file regardless of result
        let _ = SessionLookup::delete(&feature);

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
        let result = run(&feature, cwd, &design_doc, "tina/test", 2);

        let _ = SessionLookup::delete(&feature);
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
        let result = run(&feature, cwd, &design_doc, "tina/collision-test", 1);

        let _ = SessionLookup::delete(&feature);
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
            Path::new("/tmp/design.md"),
            "tina/test",
            3,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_init_validates_design_doc() {
        let temp_dir = TempDir::new().unwrap();
        let result = run(
            "test-bad-doc",
            temp_dir.path(),
            Path::new("/nonexistent/design.md"),
            "tina/test",
            3,
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
}
