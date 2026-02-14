//! Ad-hoc terminal session management endpoints.
//!
//! POST /sessions  — create a new tmux session with a CLI
//! DELETE /sessions/{sessionName} — end a session

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};

use crate::http::AppState;
use tina_data::TerminalSessionRecord;

/// CLI choices for ad-hoc sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CliChoice {
    Claude,
    Codex,
}

/// Context types for seeding a session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ContextType {
    Task,
    Plan,
    Commit,
    Design,
    Freeform,
}

/// Request body for POST /sessions.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub label: String,
    pub cli: CliChoice,
    pub context_type: Option<ContextType>,
    pub context_id: Option<String>,
    pub context_summary: Option<String>,
}

/// Response body for POST /sessions.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionResponse {
    pub session_name: String,
    pub tmux_pane_id: String,
}

/// Build the CLI command string for a given CLI choice.
pub fn cli_command(cli: CliChoice) -> &'static str {
    match cli {
        CliChoice::Claude => "claude --dangerously-skip-permissions",
        CliChoice::Codex => "codex",
    }
}

/// Build the tmux launch command for a CLI.
///
/// Includes `~/.local/bin` in PATH so symlinked CLIs installed by `mise run install`
/// are resolvable from the tmux shell even when the daemon process PATH is minimal.
pub fn cli_launch_command(cli: CliChoice) -> String {
    format!("PATH=\"$PATH:$HOME/.local/bin\" {}", cli_command(cli))
}

/// Build a context-seeding prompt from the provided context.
///
/// Returns `None` for freeform context or when no context info is provided.
pub fn build_context_seed(
    context_type: Option<ContextType>,
    context_id: Option<&str>,
    context_summary: Option<&str>,
) -> Option<String> {
    let ct = context_type?;

    if ct == ContextType::Freeform {
        return None;
    }

    let label = match ct {
        ContextType::Task => "Task",
        ContextType::Plan => "Plan",
        ContextType::Commit => "Commit",
        ContextType::Design => "Design",
        ContextType::Freeform => unreachable!(),
    };

    let mut parts = vec![format!("Context: {} session.", label)];

    if let Some(id) = context_id {
        parts.push(format!("{} ID: {}", label, id));
    }

    if let Some(summary) = context_summary {
        parts.push(format!("Summary: {}", summary));
    }

    if parts.len() == 1 {
        // Only the label, no useful context
        return None;
    }

    Some(parts.join(" "))
}

/// Generate a unique session name.
pub fn generate_session_name() -> String {
    let short_id = &uuid::Uuid::new_v4().to_string()[..8];
    format!("tina-adhoc-{}", short_id)
}

/// Get the tmux pane ID for a session (blocking — call from spawn_blocking).
pub fn get_pane_id_blocking(session_name: &str) -> Result<String, String> {
    let output = std::process::Command::new("tmux")
        .args([
            "display-message",
            "-t",
            session_name,
            "-p",
            "#{pane_id}",
        ])
        .output()
        .map_err(|e| format!("failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux display-message failed: {}", stderr.trim()));
    }

    let pane_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if pane_id.is_empty() {
        return Err("tmux returned empty pane ID".into());
    }

    Ok(pane_id)
}

/// Create a tmux session (blocking — call from spawn_blocking).
pub fn create_tmux_session_blocking(session_name: &str) -> Result<(), String> {
    let output = std::process::Command::new("tmux")
        .args(["new-session", "-d", "-s", session_name])
        .output()
        .map_err(|e| format!("failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux new-session failed: {}", stderr.trim()));
    }

    Ok(())
}

/// Send a command to a tmux session (blocking).
pub fn send_keys_blocking(session_name: &str, text: &str) -> Result<(), String> {
    // Send text literally
    let output = std::process::Command::new("tmux")
        .args(["send-keys", "-l", "-t", session_name, text])
        .output()
        .map_err(|e| format!("failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux send-keys failed: {}", stderr.trim()));
    }

    // Small delay then send Enter
    std::thread::sleep(std::time::Duration::from_millis(200));

    let output = std::process::Command::new("tmux")
        .args(["send-keys", "-t", session_name, "Enter"])
        .output()
        .map_err(|e| format!("failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux send-keys Enter failed: {}", stderr.trim()));
    }

    Ok(())
}

/// Kill a tmux session (blocking).
pub fn kill_session_blocking(session_name: &str) -> Result<(), String> {
    let output = std::process::Command::new("tmux")
        .args(["kill-session", "-t", session_name])
        .output()
        .map_err(|e| format!("failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Don't error if session doesn't exist
        if !stderr.contains("no server running")
            && !stderr.contains("session not found")
            && !stderr.contains("can't find session")
        {
            return Err(format!("tmux kill-session failed: {}", stderr.trim()));
        }
    }

    Ok(())
}

/// Capture pane output (blocking).
pub fn capture_pane_blocking(session_name: &str) -> Result<String, String> {
    let output = std::process::Command::new("tmux")
        .args(["capture-pane", "-t", session_name, "-p", "-S", "-50"])
        .output()
        .map_err(|e| format!("failed to run tmux: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("tmux capture-pane failed: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Check if CLI output indicates readiness (prompt visible).
pub fn is_cli_ready(output: &str) -> bool {
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('>') || trimmed.starts_with('❯') {
            return true;
        }
        if trimmed.contains("bypass permissions") {
            return true;
        }
    }
    false
}

/// Detect terminal output that indicates CLI startup failed.
pub fn detect_cli_startup_error(output: &str, cli: CliChoice) -> Option<String> {
    let lowered = output.to_ascii_lowercase();
    let cli_name = match cli {
        CliChoice::Claude => "claude",
        CliChoice::Codex => "codex",
    };

    if lowered.contains("command not found") && lowered.contains(cli_name) {
        return Some(format!(
            "CLI `{}` not found in tmux shell PATH. Install it and/or ensure ~/.local/bin is available.",
            cli_name
        ));
    }

    if lowered.contains("no such file or directory") && lowered.contains(cli_name) {
        return Some(format!(
            "CLI `{}` could not be executed (no such file or directory).",
            cli_name
        ));
    }

    if lowered.contains("permission denied") && lowered.contains(cli_name) {
        return Some(format!("CLI `{}` could not be executed (permission denied).", cli_name));
    }

    None
}

/// POST /sessions handler.
pub async fn create_session(
    State(state): State<AppState>,
    Json(req): Json<CreateSessionRequest>,
) -> Result<(StatusCode, Json<CreateSessionResponse>), (StatusCode, String)> {
    let session_name = generate_session_name();
    let cli_cmd = cli_launch_command(req.cli);

    // 1. Create tmux session
    let sn = session_name.clone();
    tokio::task::spawn_blocking(move || create_tmux_session_blocking(&sn))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // 2. Launch CLI in the session
    let sn = session_name.clone();
    let cmd = cli_cmd;
    tokio::task::spawn_blocking(move || send_keys_blocking(&sn, &cmd))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // 3. Wait for CLI readiness (poll up to 30s)
    let sn = session_name.clone();
    let selected_cli = req.cli;
    let ready = tokio::task::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(30);
        loop {
            if start.elapsed() > timeout {
                return Err("CLI did not become ready within 30s".to_string());
            }
            if let Ok(output) = capture_pane_blocking(&sn) {
                if let Some(startup_error) = detect_cli_startup_error(&output, selected_cli) {
                    return Err(startup_error);
                }
                if is_cli_ready(&output) {
                    return Ok(());
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Err(e) = ready {
        // Cleanup: kill the session on failure
        let sn = session_name.clone();
        let _ =
            tokio::task::spawn_blocking(move || kill_session_blocking(&sn)).await;
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e));
    }

    // 4. Send context seed if provided
    let seed = build_context_seed(
        req.context_type,
        req.context_id.as_deref(),
        req.context_summary.as_deref(),
    );
    if let Some(seed_text) = seed {
        let sn = session_name.clone();
        tokio::task::spawn_blocking(move || send_keys_blocking(&sn, &seed_text))
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .map_err(|e| {
                error!(session = %session_name, error = %e, "failed to send context seed");
                (StatusCode::INTERNAL_SERVER_ERROR, e)
            })?;
    }

    // 5. Get pane ID
    let sn = session_name.clone();
    let pane_id = tokio::task::spawn_blocking(move || get_pane_id_blocking(&sn))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // 6. Write to Convex terminalSessions table
    let cli_str = match req.cli {
        CliChoice::Claude => "claude",
        CliChoice::Codex => "codex",
    };
    let now = chrono::Utc::now().timestamp_millis() as f64;
    let record = TerminalSessionRecord {
        session_name: session_name.clone(),
        tmux_pane_id: pane_id.clone(),
        label: req.label,
        cli: cli_str.to_string(),
        status: "active".to_string(),
        context_type: req.context_type.map(|ct| format!("{:?}", ct).to_lowercase()),
        context_id: req.context_id,
        context_summary: req.context_summary,
        created_at: now,
        ended_at: None,
    };

    if let Some(ref client) = state.convex_client {
        let mut client_guard = client.lock().await;
        if let Err(e) = client_guard.upsert_terminal_session(&record).await {
            warn!(
                session_name = %session_name,
                error = %e,
                "failed to persist terminal session to Convex (session still created)"
            );
        }
    }

    info!(
        session_name = %session_name,
        pane_id = %pane_id,
        cli = ?req.cli,
        "ad-hoc session created"
    );

    Ok((
        StatusCode::CREATED,
        Json(CreateSessionResponse {
            session_name,
            tmux_pane_id: pane_id,
        }),
    ))
}

/// DELETE /sessions/{sessionName} handler.
pub async fn delete_session(
    State(state): State<AppState>,
    Path(session_name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    // 1. Kill tmux session
    let sn = session_name.clone();
    tokio::task::spawn_blocking(move || kill_session_blocking(&sn))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // 2. Mark Convex record as ended
    if let Some(ref client) = state.convex_client {
        let now = chrono::Utc::now().timestamp_millis() as f64;
        let mut client_guard = client.lock().await;
        if let Err(e) = client_guard.mark_terminal_ended(&session_name, now).await {
            warn!(
                session_name = %session_name,
                error = %e,
                "failed to mark terminal session as ended in Convex (session still killed)"
            );
        }
    }

    info!(session_name = %session_name, "ad-hoc session ended");

    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- CliChoice ---

    #[test]
    fn cli_command_returns_claude_with_skip_permissions() {
        assert_eq!(
            cli_command(CliChoice::Claude),
            "claude --dangerously-skip-permissions"
        );
    }

    #[test]
    fn cli_command_returns_codex_for_codex() {
        assert_eq!(cli_command(CliChoice::Codex), "codex");
    }

    #[test]
    fn cli_launch_command_prefixes_local_bin_path() {
        let cmd = cli_launch_command(CliChoice::Claude);
        assert!(cmd.starts_with("PATH=\"$PATH:$HOME/.local/bin\" "));
        assert!(cmd.ends_with("claude --dangerously-skip-permissions"));
    }

    // --- Context seeding ---

    #[test]
    fn build_context_seed_returns_none_for_freeform() {
        let result = build_context_seed(
            Some(ContextType::Freeform),
            Some("id-123"),
            Some("some summary"),
        );
        assert_eq!(result, None);
    }

    #[test]
    fn build_context_seed_returns_none_when_no_context_type() {
        let result = build_context_seed(None, Some("id-123"), Some("summary"));
        assert_eq!(result, None);
    }

    #[test]
    fn build_context_seed_returns_none_when_no_id_or_summary() {
        let result = build_context_seed(Some(ContextType::Task), None, None);
        assert_eq!(result, None);
    }

    #[test]
    fn build_context_seed_includes_task_id_and_summary() {
        let result = build_context_seed(
            Some(ContextType::Task),
            Some("task-abc"),
            Some("Fix the auth bug"),
        );
        assert_eq!(
            result,
            Some("Context: Task session. Task ID: task-abc Summary: Fix the auth bug".to_string())
        );
    }

    #[test]
    fn build_context_seed_includes_plan_id_only() {
        let result = build_context_seed(Some(ContextType::Plan), Some("plan-xyz"), None);
        assert_eq!(
            result,
            Some("Context: Plan session. Plan ID: plan-xyz".to_string())
        );
    }

    #[test]
    fn build_context_seed_includes_summary_only() {
        let result = build_context_seed(
            Some(ContextType::Commit),
            None,
            Some("feat: add auth"),
        );
        assert_eq!(
            result,
            Some("Context: Commit session. Summary: feat: add auth".to_string())
        );
    }

    #[test]
    fn build_context_seed_design_type() {
        let result = build_context_seed(
            Some(ContextType::Design),
            Some("design-001"),
            Some("Auth system design"),
        );
        assert_eq!(
            result,
            Some(
                "Context: Design session. Design ID: design-001 Summary: Auth system design"
                    .to_string()
            )
        );
    }

    // --- Session name generation ---

    #[test]
    fn generate_session_name_has_correct_prefix() {
        let name = generate_session_name();
        assert!(name.starts_with("tina-adhoc-"), "got: {}", name);
    }

    #[test]
    fn generate_session_name_is_unique() {
        let name1 = generate_session_name();
        let name2 = generate_session_name();
        assert_ne!(name1, name2);
    }

    #[test]
    fn generate_session_name_has_reasonable_length() {
        let name = generate_session_name();
        // "tina-adhoc-" (11) + 8 chars = 19
        assert_eq!(name.len(), 19, "got: {} (len={})", name, name.len());
    }

    // --- CLI readiness detection ---

    #[test]
    fn is_cli_ready_detects_prompt() {
        assert!(is_cli_ready("> "));
        assert!(is_cli_ready("  > "));
        assert!(is_cli_ready("❯ "));
    }

    #[test]
    fn is_cli_ready_detects_bypass_permissions() {
        assert!(is_cli_ready("bypass permissions on (shift+Tab)"));
    }

    #[test]
    fn is_cli_ready_returns_false_for_loading() {
        assert!(!is_cli_ready("Loading..."));
        assert!(!is_cli_ready(""));
        assert!(!is_cli_ready("Starting Claude Code..."));
    }

    #[test]
    fn detect_cli_startup_error_detects_command_not_found() {
        let output = "-sh: claude: command not found";
        let err = detect_cli_startup_error(output, CliChoice::Claude);
        assert!(err.is_some());
    }

    #[test]
    fn detect_cli_startup_error_returns_none_for_normal_output() {
        let output = "Starting Claude Code...\nLoading...";
        let err = detect_cli_startup_error(output, CliChoice::Claude);
        assert!(err.is_none());
    }

    // --- Request deserialization ---

    #[test]
    fn deserialize_create_session_request_minimal() {
        let json = r#"{"label": "Quick chat", "cli": "claude"}"#;
        let req: CreateSessionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.label, "Quick chat");
        assert_eq!(req.cli, CliChoice::Claude);
        assert!(req.context_type.is_none());
        assert!(req.context_id.is_none());
        assert!(req.context_summary.is_none());
    }

    #[test]
    fn deserialize_create_session_request_full() {
        let json = r#"{
            "label": "Debug auth",
            "cli": "codex",
            "contextType": "task",
            "contextId": "task-123",
            "contextSummary": "Fix the login bug"
        }"#;
        let req: CreateSessionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.label, "Debug auth");
        assert_eq!(req.cli, CliChoice::Codex);
        assert_eq!(req.context_type, Some(ContextType::Task));
        assert_eq!(req.context_id, Some("task-123".to_string()));
        assert_eq!(req.context_summary, Some("Fix the login bug".to_string()));
    }

    #[test]
    fn deserialize_create_session_request_rejects_invalid_cli() {
        let json = r#"{"label": "Test", "cli": "invalid"}"#;
        let result: Result<CreateSessionRequest, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn deserialize_create_session_request_rejects_missing_label() {
        let json = r#"{"cli": "claude"}"#;
        let result: Result<CreateSessionRequest, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    // --- Response serialization ---

    #[test]
    fn serialize_create_session_response() {
        let resp = CreateSessionResponse {
            session_name: "tina-adhoc-abc12345".to_string(),
            tmux_pane_id: "%42".to_string(),
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["sessionName"], "tina-adhoc-abc12345");
        assert_eq!(json["tmuxPaneId"], "%42");
    }
}
