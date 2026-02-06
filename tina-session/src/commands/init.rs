use std::fs;
use std::path::Path;
use std::process::Command;

use chrono::Utc;

use tina_session::db;
use tina_session::error::SessionError;
use tina_session::session::lookup::SessionLookup;
use tina_session::state::schema::SupervisorState;

pub fn run(
    feature: &str,
    cwd: &Path,
    design_doc: &Path,
    branch: &str,
    total_phases: u32,
) -> anyhow::Result<u8> {
    // Validate cwd exists and is a directory
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
            existing.cwd.display().to_string()
        ));
    }

    // Resolve paths to absolute
    let cwd_abs = fs::canonicalize(cwd)?;
    let design_doc_abs = fs::canonicalize(design_doc)?;

    // Create lookup file
    let lookup = SessionLookup::new(feature, cwd_abs.clone());
    lookup.save()?;

    // Create supervisor state
    let state = SupervisorState::new(
        feature,
        design_doc_abs.clone(),
        cwd_abs.clone(),
        branch,
        total_phases,
    );
    state.save()?;

    // Write orchestration to SQLite
    if let Err(e) = write_to_sqlite(feature, &cwd_abs, &design_doc_abs, branch, total_phases) {
        eprintln!("Warning: Failed to write to SQLite: {}", e);
    }

    // Auto-start daemon if not running
    if tina_session::daemon::status().is_none() {
        match tina_session::daemon::start() {
            Ok(pid) => eprintln!("Auto-started daemon (pid {})", pid),
            Err(e) => eprintln!("Warning: Failed to auto-start daemon: {}", e),
        }
    }

    println!("Initialized orchestration for '{}'", feature);
    println!("  Worktree: {}", cwd_abs.display());
    println!("  State: {}", SupervisorState::state_path(&cwd_abs).display());
    println!("  Lookup: {}", SessionLookup::lookup_path(feature).display());

    Ok(0)
}

/// Write orchestration record to SQLite, auto-creating the project.
fn write_to_sqlite(
    feature: &str,
    cwd: &Path,
    design_doc: &Path,
    branch: &str,
    total_phases: u32,
) -> anyhow::Result<()> {
    let db_path = db::default_db_path();
    let conn = db::open_or_create(&db_path)?;
    db::migrations::migrate(&conn)?;

    // Find repo root from cwd
    let repo_root = find_repo_root(cwd)?;
    let repo_name = repo_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown");

    // Find or create the project
    let project_id =
        db::projects::find_or_create_by_repo_path(&conn, repo_name, &repo_root.to_string_lossy())?;

    // Create orchestration record
    let now = Utc::now().to_rfc3339();
    let orch_id = format!("{}_{}", feature, now);
    let orch = db::orchestrations::Orchestration {
        id: orch_id,
        project_id,
        feature_name: feature.to_string(),
        design_doc_path: design_doc.to_string_lossy().to_string(),
        branch: branch.to_string(),
        worktree_path: Some(cwd.to_string_lossy().to_string()),
        total_phases: total_phases as i32,
        status: "planning".to_string(),
        started_at: now,
        completed_at: None,
        total_elapsed_mins: None,
    };
    db::orchestrations::insert(&conn, &orch)?;

    Ok(())
}

/// Find the git repo root for a given path.
fn find_repo_root(cwd: &Path) -> anyhow::Result<std::path::PathBuf> {
    let output = Command::new("git")
        .args(["-C", &cwd.to_string_lossy(), "rev-parse", "--show-toplevel"])
        .output()?;

    if !output.status.success() {
        anyhow::bail!("Not a git repository: {}", cwd.display());
    }

    let root = String::from_utf8(output.stdout)?.trim().to_string();
    Ok(std::path::PathBuf::from(root))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_init_creates_files() {
        let temp_dir = TempDir::new().unwrap();
        let cwd = temp_dir.path();

        // Create a fake design doc
        let design_doc = cwd.join("design.md");
        fs::write(&design_doc, "# Design").unwrap();

        // Use a unique feature name to avoid conflicts
        let feature = format!("test-init-{}", std::process::id());

        // Run init
        let result = run(&feature, cwd, &design_doc, "tina/test", 3);

        // Clean up lookup file regardless of result
        let _ = SessionLookup::delete(&feature);

        assert!(result.is_ok());

        // Verify state file was created
        let state_path = SupervisorState::state_path(cwd);
        assert!(state_path.exists());

        // Clean up
        let _ = fs::remove_file(&state_path);
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
}
