use std::fs;
use std::path::Path;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{Event, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};

use crate::error::{Result, SessionError};

/// Result of waiting for phase completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaitResult {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_range: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Phase status file structure (written by team-lead-init)
#[derive(Debug, Clone, Deserialize)]
struct PhaseStatusFile {
    status: String,
    #[serde(default)]
    git_range: Option<String>,
    #[serde(default)]
    blocked_reason: Option<String>,
}

/// Watch a status file for completion.
pub fn watch_status(status_path: &Path, timeout_secs: Option<u64>) -> Result<WaitResult> {
    let start = Instant::now();
    let timeout = timeout_secs.map(Duration::from_secs);

    // Check if file already indicates completion
    if let Some(result) = check_status_file(status_path) {
        return Ok(result);
    }

    // Set up file watcher
    let (tx, rx) = mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: std::result::Result<Event, _>| {
        if let Ok(_event) = res {
            let _ = tx.send(());
        }
    })
    .map_err(|e| SessionError::Timeout(format!("Failed to create watcher: {}", e)))?;

    // Watch the parent directory (status file might not exist yet)
    let watch_dir = status_path
        .parent()
        .ok_or_else(|| SessionError::FileNotFound(status_path.display().to_string()))?;

    // Create directory if it doesn't exist
    if !watch_dir.exists() {
        fs::create_dir_all(watch_dir).map_err(|e| {
            SessionError::DirectoryNotFound(format!("{}: {}", watch_dir.display(), e))
        })?;
    }

    watcher
        .watch(watch_dir, RecursiveMode::NonRecursive)
        .map_err(|e| SessionError::Timeout(format!("Failed to watch: {}", e)))?;

    // Poll with file watching
    loop {
        // Check timeout
        if let Some(t) = timeout {
            if start.elapsed() > t {
                return Err(SessionError::Timeout(format!(
                    "Timed out waiting for {}",
                    status_path.display()
                )));
            }
        }

        // Check status file
        if let Some(result) = check_status_file(status_path) {
            return Ok(result);
        }

        // Wait for file change or timeout
        let wait_timeout = Duration::from_secs(5); // Check every 5s even without events
        let _ = rx.recv_timeout(wait_timeout);
    }
}

/// Check the status file and return result if complete or blocked.
fn check_status_file(path: &Path) -> Option<WaitResult> {
    if !path.exists() {
        return None;
    }

    let contents = fs::read_to_string(path).ok()?;
    let status: PhaseStatusFile = serde_json::from_str(&contents).ok()?;

    match status.status.as_str() {
        "complete" => Some(WaitResult {
            status: "complete".to_string(),
            git_range: status.git_range,
            reason: None,
        }),
        "blocked" => Some(WaitResult {
            status: "blocked".to_string(),
            git_range: None,
            reason: status.blocked_reason,
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_check_status_file_complete() {
        let temp = TempDir::new().unwrap();
        let status_path = temp.path().join("status.json");

        fs::write(
            &status_path,
            r#"{"status": "complete", "git_range": "abc123..def456"}"#,
        )
        .unwrap();

        let result = check_status_file(&status_path).unwrap();
        assert_eq!(result.status, "complete");
        assert_eq!(result.git_range, Some("abc123..def456".to_string()));
    }

    #[test]
    fn test_check_status_file_blocked() {
        let temp = TempDir::new().unwrap();
        let status_path = temp.path().join("status.json");

        fs::write(
            &status_path,
            r#"{"status": "blocked", "blocked_reason": "Tests failing"}"#,
        )
        .unwrap();

        let result = check_status_file(&status_path).unwrap();
        assert_eq!(result.status, "blocked");
        assert_eq!(result.reason, Some("Tests failing".to_string()));
    }

    #[test]
    fn test_check_status_file_executing() {
        let temp = TempDir::new().unwrap();
        let status_path = temp.path().join("status.json");

        fs::write(&status_path, r#"{"status": "executing"}"#).unwrap();

        // Should return None for executing status
        assert!(check_status_file(&status_path).is_none());
    }
}
