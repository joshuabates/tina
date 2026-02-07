use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use chrono::{DateTime, Utc};
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

/// Streaming status update (output periodically while waiting).
#[derive(Debug, Clone, Serialize)]
pub struct StatusUpdate {
    /// Seconds elapsed since wait started
    pub elapsed_secs: u64,
    /// Current phase status
    pub status: String,
    /// Task progress: completed count
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tasks_complete: Option<u32>,
    /// Task progress: total count
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tasks_total: Option<u32>,
    /// Current task being worked on
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_task: Option<String>,
    /// Most recent commit message (abbreviated)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_commit: Option<String>,
    /// Git range if complete
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_range: Option<String>,
    /// Blocked reason if blocked
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocked_reason: Option<String>,
}

/// Phase status file structure (written by team-lead-init)
#[derive(Debug, Clone, Deserialize)]
struct PhaseStatusFile {
    status: String,
    #[serde(default)]
    git_range: Option<String>,
    #[serde(default)]
    blocked_reason: Option<String>,
    /// ISO 8601 timestamp updated periodically while phase is active.
    /// Used to detect stale/dead sessions.
    #[serde(default)]
    #[allow(dead_code)]
    heartbeat_at: Option<DateTime<Utc>>,
}

/// Default threshold for considering a heartbeat stale (seconds).
pub const HEARTBEAT_STALE_SECS: i64 = 300;

/// Check if a heartbeat timestamp is stale (older than threshold).
pub fn is_heartbeat_stale(heartbeat: &DateTime<Utc>, threshold_secs: i64) -> bool {
    let elapsed = Utc::now().signed_duration_since(*heartbeat);
    elapsed.num_seconds() > threshold_secs
}

/// Watch a status file for completion.
///
/// If `session_name` is provided, periodically checks whether the tmux session
/// is still alive. Returns a `session_died` result if the session disappears
/// while the phase status is not yet complete.
pub fn watch_status(
    status_path: &Path,
    timeout_secs: Option<u64>,
    session_name: Option<&str>,
) -> Result<WaitResult> {
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

        // Check tmux session health
        if let Some(name) = session_name {
            if !crate::tmux::session_exists(name) {
                return Ok(WaitResult {
                    status: "session_died".to_string(),
                    git_range: None,
                    reason: Some(format!("tmux session '{}' no longer exists", name)),
                });
            }
        }

        // Wait for file change or timeout
        let wait_timeout = Duration::from_secs(5); // Check every 5s even without events
        let _ = rx.recv_timeout(wait_timeout);
    }
}

/// Watch status file with streaming updates.
///
/// Outputs JSON status updates to stdout at the specified interval while waiting.
/// Returns the final result when complete or blocked.
///
/// `team_name` is used to find the task list for progress tracking.
/// `session_name` is used to detect tmux session death during the wait.
pub fn watch_status_streaming(
    status_path: &Path,
    worktree_path: &Path,
    team_name: Option<&str>,
    timeout_secs: Option<u64>,
    interval_secs: u64,
    session_name: Option<&str>,
) -> Result<WaitResult> {
    let start = Instant::now();
    let timeout = timeout_secs.map(Duration::from_secs);
    let interval = Duration::from_secs(interval_secs);
    let mut last_update = Instant::now() - interval; // Trigger immediate first update

    // Check if file already indicates completion
    if let Some(result) = check_status_file(status_path) {
        // Output final status
        let update = StatusUpdate {
            elapsed_secs: start.elapsed().as_secs(),
            status: result.status.clone(),
            tasks_complete: None,
            tasks_total: None,
            current_task: None,
            last_commit: None,
            git_range: result.git_range.clone(),
            blocked_reason: result.reason.clone(),
        };
        println!("{}", serde_json::to_string(&update).unwrap_or_default());
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

    // Poll with file watching and streaming updates
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

        // Output status update if interval has passed
        if last_update.elapsed() >= interval {
            let current_status = get_current_status(status_path);
            let (tasks_complete, tasks_total, current_task) = get_task_progress(team_name);
            let last_commit = get_last_commit(worktree_path);

            let update = StatusUpdate {
                elapsed_secs: start.elapsed().as_secs(),
                status: current_status.clone(),
                tasks_complete,
                tasks_total,
                current_task,
                last_commit,
                git_range: None,
                blocked_reason: None,
            };
            println!("{}", serde_json::to_string(&update).unwrap_or_default());
            last_update = Instant::now();
        }

        // Check status file for completion
        if let Some(result) = check_status_file(status_path) {
            // Output final status
            let (tasks_complete, tasks_total, _) = get_task_progress(team_name);
            let update = StatusUpdate {
                elapsed_secs: start.elapsed().as_secs(),
                status: result.status.clone(),
                tasks_complete,
                tasks_total,
                current_task: None,
                last_commit: None,
                git_range: result.git_range.clone(),
                blocked_reason: result.reason.clone(),
            };
            println!("{}", serde_json::to_string(&update).unwrap_or_default());
            return Ok(result);
        }

        // Check tmux session health
        if let Some(name) = session_name {
            if !crate::tmux::session_exists(name) {
                let result = WaitResult {
                    status: "session_died".to_string(),
                    git_range: None,
                    reason: Some(format!("tmux session '{}' no longer exists", name)),
                };
                let update = StatusUpdate {
                    elapsed_secs: start.elapsed().as_secs(),
                    status: result.status.clone(),
                    tasks_complete: None,
                    tasks_total: None,
                    current_task: None,
                    last_commit: None,
                    git_range: None,
                    blocked_reason: result.reason.clone(),
                };
                println!("{}", serde_json::to_string(&update).unwrap_or_default());
                return Ok(result);
            }
        }

        // Wait for file change or interval
        let wait_timeout = Duration::from_secs(5);
        let _ = rx.recv_timeout(wait_timeout);
    }
}

/// Get the current status from status file (without checking for completion).
pub fn get_current_status(path: &Path) -> String {
    if !path.exists() {
        return "waiting".to_string();
    }

    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<PhaseStatusFile>(&contents).ok())
        .map(|s| s.status)
        .unwrap_or_else(|| "unknown".to_string())
}

/// Task file structure (simplified - just what we need).
#[derive(Debug, Clone, Deserialize)]
struct TaskFile {
    subject: String,
    status: String,
}

/// Get task progress from the team's task directory.
/// Returns (completed, total, current_task_subject).
pub fn get_task_progress(team_name: Option<&str>) -> (Option<u32>, Option<u32>, Option<String>) {
    let team = match team_name {
        Some(t) => t,
        None => return (None, None, None),
    };

    // Task directory: ~/.claude/tasks/{team_name}/
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return (None, None, None),
    };

    let task_dir = Path::new(&home)
        .join(".claude")
        .join("tasks")
        .join(team);

    if !task_dir.exists() {
        return (None, None, None);
    }

    // Read all .json files in the task directory
    let entries = match fs::read_dir(&task_dir) {
        Ok(e) => e,
        Err(_) => return (None, None, None),
    };

    let mut total = 0u32;
    let mut completed = 0u32;
    let mut current_task: Option<String> = None;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "json").unwrap_or(false) {
            if let Ok(contents) = fs::read_to_string(&path) {
                if let Ok(task) = serde_json::from_str::<TaskFile>(&contents) {
                    total += 1;
                    match task.status.as_str() {
                        "completed" => completed += 1,
                        "in_progress" => {
                            // Capture the in-progress task subject
                            let subject = if task.subject.len() > 50 {
                                format!("{}...", &task.subject[..47])
                            } else {
                                task.subject
                            };
                            current_task = Some(subject);
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    if total == 0 {
        (None, None, None)
    } else {
        (Some(completed), Some(total), current_task)
    }
}

/// Get the last commit message (abbreviated).
pub fn get_last_commit(worktree_path: &Path) -> Option<String> {
    Command::new("git")
        .args(["log", "-1", "--format=%s", "--no-walk"])
        .current_dir(worktree_path)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            let msg = String::from_utf8_lossy(&o.stdout).trim().to_string();
            // Truncate long messages
            if msg.len() > 60 {
                format!("{}...", &msg[..57])
            } else {
                msg
            }
        })
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

    #[test]
    fn test_check_status_file_with_heartbeat() {
        let temp = TempDir::new().unwrap();
        let status_path = temp.path().join("status.json");

        fs::write(
            &status_path,
            r#"{"status": "executing", "heartbeat_at": "2026-02-07T12:00:00Z"}"#,
        )
        .unwrap();

        // Executing status should still return None (not terminal)
        assert!(check_status_file(&status_path).is_none());
    }

    #[test]
    fn test_heartbeat_stale_detection() {
        use chrono::Duration;

        let recent = Utc::now() - Duration::seconds(10);
        assert!(!is_heartbeat_stale(&recent, HEARTBEAT_STALE_SECS));

        let old = Utc::now() - Duration::seconds(600);
        assert!(is_heartbeat_stale(&old, HEARTBEAT_STALE_SECS));
    }

    #[test]
    fn test_check_status_file_complete_ignores_heartbeat() {
        let temp = TempDir::new().unwrap();
        let status_path = temp.path().join("status.json");

        fs::write(
            &status_path,
            r#"{"status": "complete", "git_range": "abc..def", "heartbeat_at": "2026-02-07T12:00:00Z"}"#,
        )
        .unwrap();

        let result = check_status_file(&status_path).unwrap();
        assert_eq!(result.status, "complete");
        assert_eq!(result.git_range, Some("abc..def".to_string()));
    }
}
