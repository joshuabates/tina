use std::path::Path;
use std::process::Command;

use crate::error::{Result, SessionError};

/// Create a new tmux session.
pub fn create_session(name: &str, cwd: &Path, command: Option<&str>) -> Result<()> {
    let mut args = vec![
        "new-session",
        "-d", // detached
        "-s",
        name, // session name
        "-c", // start directory
    ];
    let cwd_str = cwd.to_string_lossy();
    args.push(&cwd_str);

    if let Some(cmd) = command {
        args.push(cmd);
    }

    let output = Command::new("tmux")
        .args(&args)
        .output()
        .map_err(|e| SessionError::TmuxError(format!("Failed to execute tmux: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(SessionError::TmuxError(format!(
            "tmux new-session failed: {}",
            stderr.trim()
        )));
    }

    Ok(())
}

/// Kill a tmux session.
pub fn kill_session(name: &str) -> Result<()> {
    let output = Command::new("tmux")
        .args(["kill-session", "-t", name])
        .output()
        .map_err(|e| SessionError::TmuxError(format!("Failed to execute tmux: {}", e)))?;

    // Ignore errors if session doesn't exist
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !stderr.contains("no server running") && !stderr.contains("session not found") {
            return Err(SessionError::TmuxError(format!(
                "tmux kill-session failed: {}",
                stderr.trim()
            )));
        }
    }

    Ok(())
}

/// Check if a tmux session exists.
pub fn session_exists(name: &str) -> bool {
    let output = Command::new("tmux")
        .args(["has-session", "-t", name])
        .output();

    match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

/// List all tmux sessions.
pub fn list_sessions() -> Result<Vec<String>> {
    let output = Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()
        .map_err(|e| SessionError::TmuxError(format!("Failed to execute tmux: {}", e)))?;

    if !output.status.success() {
        // No sessions is not an error
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().map(|s| s.to_string()).collect())
}
