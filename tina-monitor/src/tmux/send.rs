//! Tmux send keys functionality

use std::process::Command;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SendError {
    #[error("Tmux not found: {0}")]
    TmuxNotFound(String),
    #[error("Send failed: {0}")]
    SendFailed(String),
}

/// Check if tmux is available on the system
fn is_tmux_available() -> bool {
    Command::new("tmux")
        .arg("-V")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

/// Send text to a tmux pane followed by Enter
pub fn send_keys(pane_id: &str, text: &str) -> Result<(), SendError> {
    if !is_tmux_available() {
        return Err(SendError::TmuxNotFound(
            "tmux command not found".to_string(),
        ));
    }

    let output = Command::new("tmux")
        .args(["send-keys", "-t", pane_id, text, "Enter"])
        .output()
        .map_err(|e| SendError::SendFailed(format!("Failed to execute tmux: {}", e)))?;

    if !output.status.success() {
        return Err(SendError::SendFailed(format!(
            "tmux send-keys failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

/// Send text to a tmux pane without Enter
pub fn send_keys_raw(pane_id: &str, text: &str) -> Result<(), SendError> {
    if !is_tmux_available() {
        return Err(SendError::TmuxNotFound(
            "tmux command not found".to_string(),
        ));
    }

    let output = Command::new("tmux")
        .args(["send-keys", "-t", pane_id, text])
        .output()
        .map_err(|e| SendError::SendFailed(format!("Failed to execute tmux: {}", e)))?;

    if !output.status.success() {
        return Err(SendError::SendFailed(format!(
            "tmux send-keys failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_send_keys_returns_error_for_invalid_pane() {
        let invalid_pane_id = "definitely-not-a-real-pane-id-12345";
        let result = send_keys(invalid_pane_id, "echo test");

        assert!(result.is_err(), "Expected error for invalid pane ID");

        match result {
            Err(SendError::SendFailed(_)) => (),
            Err(SendError::TmuxNotFound(_)) => (),
            Ok(_) => panic!("Expected error but got success"),
        }
    }

    #[test]
    fn test_send_keys_raw_returns_error_for_invalid_pane() {
        let invalid_pane_id = "definitely-not-a-real-pane-id-67890";
        let result = send_keys_raw(invalid_pane_id, "echo test");

        assert!(result.is_err(), "Expected error for invalid pane ID");

        match result {
            Err(SendError::SendFailed(_)) => (),
            Err(SendError::TmuxNotFound(_)) => (),
            Ok(_) => panic!("Expected error but got success"),
        }
    }

    #[test]
    fn test_send_keys_handles_special_characters() {
        // This will fail with invalid pane, but we're testing that special chars
        // don't cause parse errors or panics
        let invalid_pane_id = "definitely-not-a-real-pane-id-special";
        let special_text = "test $VAR && echo 'quoted' | grep \"pattern\"";

        let result = send_keys(invalid_pane_id, special_text);

        // Should still return a SendError, not panic on special characters
        assert!(result.is_err());
        match result {
            Err(SendError::SendFailed(_)) | Err(SendError::TmuxNotFound(_)) => (),
            Ok(_) => panic!("Expected error but got success"),
        }
    }
}
