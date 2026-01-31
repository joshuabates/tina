use std::process::Command;

use crate::error::{Result, SessionError};

/// Send keys to a tmux session.
pub fn send_keys(session: &str, text: &str) -> Result<()> {
    let output = Command::new("tmux")
        .args(["send-keys", "-t", session, text, "Enter"])
        .output()
        .map_err(|e| SessionError::TmuxError(format!("Failed to execute tmux: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(SessionError::TmuxError(format!(
            "tmux send-keys failed: {}",
            stderr.trim()
        )));
    }

    Ok(())
}

/// Send keys without pressing Enter.
pub fn send_keys_raw(session: &str, text: &str) -> Result<()> {
    let output = Command::new("tmux")
        .args(["send-keys", "-t", session, text])
        .output()
        .map_err(|e| SessionError::TmuxError(format!("Failed to execute tmux: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(SessionError::TmuxError(format!(
            "tmux send-keys failed: {}",
            stderr.trim()
        )));
    }

    Ok(())
}
