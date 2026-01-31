use std::fs;
use std::path::Path;

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
        design_doc_abs,
        cwd_abs.clone(),
        branch,
        total_phases,
    );
    state.save()?;

    println!("Initialized orchestration for '{}'", feature);
    println!("  Worktree: {}", cwd_abs.display());
    println!("  State: {}", SupervisorState::state_path(&cwd_abs).display());
    println!("  Lookup: {}", SessionLookup::lookup_path(feature).display());

    Ok(0)
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
