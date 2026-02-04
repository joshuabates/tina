//! Validate command implementation

use std::path::Path;

use anyhow::{Context, Result};
use tina_session::state::validation::{
    validate_session_lookup, validate_supervisor_state, validate_task, validate_team,
    validate_tina_directory, ValidationResult,
};

/// Run the validate command.
pub fn run(path: &Path, report_mode: bool) -> Result<()> {
    let result = validate_path(path)?;

    // Print errors
    for error in &result.errors {
        eprintln!("ERROR: {}", error);
    }

    // Print warnings
    for warning in &result.warnings {
        eprintln!("WARN: {}", warning);
    }

    // Print summary
    if result.errors.is_empty() && result.warnings.is_empty() {
        println!("Validation passed: no issues found");
    } else {
        println!(
            "\nValidation complete: {} errors, {} warnings",
            result.errors.len(),
            result.warnings.len()
        );
    }

    // Exit with error if not in report mode and there are errors
    if !report_mode && !result.is_valid() {
        std::process::exit(1);
    }

    Ok(())
}

/// Validate a path, detecting the type of file/directory.
fn validate_path(path: &Path) -> Result<ValidationResult> {
    if !path.exists() {
        anyhow::bail!("Path does not exist: {}", path.display());
    }

    // If it's a directory, check if it's a tina directory
    if path.is_dir() {
        // Check if this is a tina directory (has supervisor-state.json)
        if path.join("supervisor-state.json").exists() {
            return Ok(validate_tina_directory(path));
        }

        // Check if it's a worktree (has .claude/tina/)
        let tina_dir = path.join(".claude").join("tina");
        if tina_dir.exists() {
            return Ok(validate_tina_directory(&tina_dir));
        }

        // Check if it's a team directory (has config.json)
        let config_path = path.join("config.json");
        if config_path.exists() {
            return Ok(validate_team(&config_path));
        }

        // Check if it's a tasks directory (has .json files)
        let mut result = ValidationResult::new();
        for entry in std::fs::read_dir(path)
            .context(format!("Failed to read directory: {}", path.display()))?
        {
            let entry = entry.context("Failed to read directory entry")?;
            let entry_path = entry.path();
            if entry_path.extension().and_then(|s| s.to_str()) == Some("json") {
                result.merge(validate_task(&entry_path));
            }
        }
        return Ok(result);
    }

    // It's a file - determine type by name/location
    let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

    if filename == "supervisor-state.json" {
        return Ok(validate_supervisor_state(path));
    }

    if filename == "config.json" {
        // Check if parent is a team directory
        if let Some(parent) = path.parent() {
            if let Some(grandparent) = parent.parent() {
                if grandparent.file_name().and_then(|s| s.to_str()) == Some("teams") {
                    return Ok(validate_team(path));
                }
            }
        }
        // Fall through to generic JSON
    }

    // Check if it's in a tasks directory
    if let Some(parent) = path.parent() {
        if let Some(grandparent) = parent.parent() {
            if grandparent.file_name().and_then(|s| s.to_str()) == Some("tasks") {
                return Ok(validate_task(path));
            }
        }
    }

    // Check if it's in tina-sessions directory
    if let Some(parent) = path.parent() {
        if parent.file_name().and_then(|s| s.to_str()) == Some("tina-sessions") {
            return Ok(validate_session_lookup(path));
        }
    }

    // Default: try to validate as supervisor state
    Ok(validate_supervisor_state(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_validate_tina_directory() {
        let temp_dir = TempDir::new().unwrap();
        let tina_dir = temp_dir.path().join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();

        let state_path = tina_dir.join("supervisor-state.json");
        let json = r#"{
            "version": 1,
            "feature": "test",
            "design_doc": "/tmp/design.md",
            "worktree_path": "/tmp/worktree",
            "branch": "test-branch",
            "total_phases": 3,
            "current_phase": 1,
            "status": "executing",
            "orchestration_started_at": "2026-01-30T10:00:00Z",
            "phases": {},
            "timing": {}
        }"#;
        fs::write(&state_path, json).unwrap();

        let result = validate_path(temp_dir.path()).unwrap();
        assert!(result.is_valid());
    }

    #[test]
    fn test_validate_supervisor_state_file() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("supervisor-state.json");
        let json = r#"{
            "version": 1,
            "feature": "test",
            "design_doc": "/tmp/design.md",
            "worktree_path": "/tmp/worktree",
            "branch": "test-branch",
            "total_phases": 3,
            "current_phase": 1,
            "status": "executing",
            "orchestration_started_at": "2026-01-30T10:00:00Z",
            "phases": {},
            "timing": {}
        }"#;
        fs::write(&path, json).unwrap();

        let result = validate_path(&path).unwrap();
        assert!(result.is_valid());
    }

    #[test]
    fn test_validate_nonexistent_path() {
        let result = validate_path(Path::new("/nonexistent/path"));
        assert!(result.is_err());
    }
}
