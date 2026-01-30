//! Git operations for tina-monitor
//!
//! This module provides utilities for working with git repositories,
//! including commit history and diff statistics.

pub mod commits;
pub mod diff;

use std::path::Path;
use std::process::Command;
use anyhow::{Context, Result};

/// Execute a git command in the given directory
pub fn git_command(cwd: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .context("Failed to execute git command")?;

    if !output.status.success() {
        anyhow::bail!(
            "git command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn get_test_repo_path() -> PathBuf {
        // Use the current git repo for testing
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
    }

    #[test]
    fn test_git_command_basic() {
        let repo = get_test_repo_path();
        let result = git_command(&repo, &["status", "--short"]);
        assert!(result.is_ok(), "git command should execute successfully");
    }

    #[test]
    fn test_git_command_invalid_dir() {
        let invalid_path = PathBuf::from("/nonexistent/path");
        let result = git_command(&invalid_path, &["status"]);
        assert!(result.is_err(), "should error on invalid directory");
    }
}
