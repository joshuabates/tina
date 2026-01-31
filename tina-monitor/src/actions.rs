//! Actions module for executing entity actions
//!
//! Wraps tmux operations and other entity actions.

use anyhow::{Context, Result};
use std::io::Write;
use std::process::{Command, Stdio};

use crate::entity::EntityAction;

/// Execute an entity action, returning an optional status message
pub fn execute(action: EntityAction) -> Result<Option<String>> {
    match action {
        EntityAction::AttachTmux { pane_id } => {
            attach_tmux(&pane_id)?;
            Ok(None)
        }
        EntityAction::SendCommand { pane_id, command } => {
            send_command(&pane_id, &command)?;
            Ok(Some(format!("Sent: {}", command)))
        }
        EntityAction::ViewTaskDetail { task_id: _ } => {
            // Handled by quicklook - this shouldn't reach here
            Ok(None)
        }
        EntityAction::JumpToOwner { owner } => Ok(Some(format!("Jump to: {}", owner))),
        EntityAction::ViewDiff { sha } => {
            view_diff(&sha)?;
            Ok(None)
        }
        EntityAction::CopySha { sha } => {
            copy_to_clipboard(&sha)?;
            Ok(Some(format!("Copied: {}", sha)))
        }
    }
}

/// Attach to a tmux pane (suspends TUI)
fn attach_tmux(pane_id: &str) -> Result<()> {
    // Get the session:window.pane format
    let target = if pane_id.contains(':') {
        pane_id.to_string()
    } else {
        // Assume it's just a pane ID
        format!(":{}", pane_id)
    };

    Command::new("tmux")
        .arg("select-pane")
        .arg("-t")
        .arg(&target)
        .status()
        .context("Failed to select tmux pane")?;

    Command::new("tmux")
        .arg("attach-session")
        .status()
        .context("Failed to attach to tmux session")?;

    Ok(())
}

/// Send a command to a tmux pane
fn send_command(pane_id: &str, command: &str) -> Result<()> {
    Command::new("tmux")
        .args(["send-keys", "-t", pane_id, command, "Enter"])
        .status()
        .context("Failed to send command to tmux pane")?;

    Ok(())
}

/// View diff for a commit (opens external viewer)
fn view_diff(sha: &str) -> Result<()> {
    Command::new("git")
        .args(["show", sha, "--stat"])
        .status()
        .context("Failed to show git diff")?;
    Ok(())
}

/// Copy text to clipboard
fn copy_to_clipboard(text: &str) -> Result<()> {
    // Try pbcopy (macOS) first
    let result = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            child.stdin.as_mut().unwrap().write_all(text.as_bytes())?;
            child.wait()
        });

    if result.is_ok() {
        return Ok(());
    }

    // Fallback to xclip (Linux)
    Command::new("xclip")
        .arg("-selection")
        .arg("clipboard")
        .stdin(Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            child.stdin.as_mut().unwrap().write_all(text.as_bytes())?;
            child.wait()
        })
        .context("Failed to copy to clipboard (tried pbcopy and xclip)")?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jump_to_owner_returns_message() {
        let action = EntityAction::JumpToOwner {
            owner: "worker-1".to_string(),
        };
        let result = execute(action).unwrap();

        assert!(result.is_some());
        assert!(result.unwrap().contains("worker-1"));
    }

    #[test]
    fn view_task_detail_returns_none() {
        let action = EntityAction::ViewTaskDetail {
            task_id: "task-1".to_string(),
        };
        let result = execute(action).unwrap();

        assert!(result.is_none());
    }

    // Note: tmux and clipboard tests require external tools
    // and are better suited for integration tests
}
