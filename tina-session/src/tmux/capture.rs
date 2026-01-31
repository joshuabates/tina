use std::process::Command;

use crate::error::{Result, SessionError};

/// Capture the contents of a tmux pane.
pub fn capture_pane(session: &str) -> Result<String> {
    capture_pane_lines(session, 100)
}

/// Capture the last N lines of a tmux pane.
pub fn capture_pane_lines(session: &str, lines: u32) -> Result<String> {
    let start = format!("-{}", lines);
    let output = Command::new("tmux")
        .args(["capture-pane", "-t", session, "-p", "-S", &start])
        .output()
        .map_err(|e| SessionError::TmuxError(format!("Failed to execute tmux: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(SessionError::TmuxError(format!(
            "tmux capture-pane failed: {}",
            stderr.trim()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
