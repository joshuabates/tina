use std::process::Command;

use crate::error::{Result, SessionError};

/// Send keys to a tmux session followed by Enter.
/// Uses two separate calls for reliability - text first, then Enter.
pub fn send_keys(session: &str, text: &str) -> Result<()> {
    // Send text first
    send_keys_raw(session, text)?;

    // Small delay to ensure text is received
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Send Enter separately
    let output = Command::new("tmux")
        .args(["send-keys", "-t", session, "Enter"])
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
