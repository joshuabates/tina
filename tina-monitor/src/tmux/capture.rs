//! Tmux pane capture functionality

use std::process::Command;
use thiserror::Error;

/// Errors that can occur during tmux capture operations
#[derive(Debug, Error)]
pub enum CaptureError {
    #[error("Tmux not found: {0}")]
    TmuxNotFound(String),

    #[error("Capture failed: {0}")]
    CaptureFailed(String),
}

/// Check if tmux is available on the system
pub fn is_tmux_available() -> bool {
    Command::new("tmux")
        .arg("-V")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

/// Check if a tmux pane exists
pub fn pane_exists(pane_id: &str) -> bool {
    Command::new("tmux")
        .args(["display-message", "-t", pane_id, "-p", "#{pane_id}"])
        .output()
        .map(|output| {
            if !output.status.success() {
                return false;
            }
            // Check if output contains non-whitespace content
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .starts_with('%')
        })
        .unwrap_or(false)
}

/// Capture output from a tmux pane
pub fn capture_pane(pane_id: &str, lines: usize) -> Result<String, CaptureError> {
    if !is_tmux_available() {
        return Err(CaptureError::TmuxNotFound(
            "tmux command not found".to_string(),
        ));
    }

    let output = Command::new("tmux")
        .args([
            "capture-pane",
            "-t",
            pane_id,
            "-p",
            "-S",
            &format!("-{}", lines),
        ])
        .output()
        .map_err(|e| CaptureError::CaptureFailed(format!("Failed to execute tmux: {}", e)))?;

    if !output.status.success() {
        return Err(CaptureError::CaptureFailed(format!(
            "tmux capture-pane failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )));
    }

    String::from_utf8(output.stdout)
        .map_err(|e| CaptureError::CaptureFailed(format!("Invalid UTF-8 in output: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_tmux_available_returns_boolean_without_panicking() {
        // Should return either true or false without panicking
        let result = is_tmux_available();
        assert!(result == true || result == false);
    }

    #[test]
    fn test_capture_pane_with_invalid_pane_id_returns_error() {
        let invalid_pane_id = "definitely-not-a-real-pane-id-12345";
        let result = capture_pane(invalid_pane_id, 100);

        assert!(result.is_err(), "Expected error for invalid pane ID");

        match result {
            Err(CaptureError::CaptureFailed(_)) => (),
            Err(CaptureError::TmuxNotFound(_)) => (),
            Ok(_) => panic!("Expected error but got success"),
        }
    }

    #[test]
    fn test_pane_exists_returns_false_for_nonexistent_panes() {
        let nonexistent_pane_id = "definitely-not-a-real-pane-id-67890";
        let result = pane_exists(nonexistent_pane_id);

        assert!(!result, "Expected false for nonexistent pane");
    }
}
