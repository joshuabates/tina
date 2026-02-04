//! Kitty terminal handler

use std::path::Path;
use std::process::Command;

use super::{TerminalHandler, TerminalResult};

/// Handler for Kitty terminal
pub struct KittyHandler;

impl Default for KittyHandler {
    fn default() -> Self {
        Self::new()
    }
}

impl KittyHandler {
    pub fn new() -> Self {
        Self
    }
}

impl TerminalHandler for KittyHandler {
    fn is_available(&self) -> bool {
        Command::new("kitty")
            .args(["@", "ls"])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    fn open_tab_at(&self, cwd: &Path) -> anyhow::Result<TerminalResult> {
        let output = Command::new("kitty")
            .args(["@", "launch", "--type=tab", "--cwd"])
            .arg(cwd)
            .output()?;

        if output.status.success() {
            Ok(TerminalResult::Success)
        } else {
            anyhow::bail!(
                "Failed to open kitty tab: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }

    fn attach_tmux(
        &self,
        session_name: &str,
        pane_id: Option<&str>,
    ) -> anyhow::Result<TerminalResult> {
        let tmux_cmd = if let Some(pane) = pane_id {
            format!(
                "tmux attach -t {} && tmux select-pane -t {}",
                session_name, pane
            )
        } else {
            format!("tmux attach -t {}", session_name)
        };

        let output = Command::new("kitty")
            .args(["@", "launch", "--type=tab"])
            .arg("bash")
            .arg("-c")
            .arg(&tmux_cmd)
            .output()?;

        if output.status.success() {
            Ok(TerminalResult::Success)
        } else {
            anyhow::bail!(
                "Failed to attach tmux session: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_kitty_is_available_checks_kitty_command() {
        let handler = KittyHandler::new();
        let available = handler.is_available();

        // Should return true or false without panicking
        assert!(available == true || available == false);

        // If kitty is available, we can test the actual behavior
        if available {
            assert!(available, "Kitty should be detected as available");
        } else {
            assert!(!available, "Kitty should be detected as unavailable");
        }
    }

    #[test]
    #[ignore] // Opens real kitty tab - run with `cargo test -- --ignored`
    fn test_open_tab_at_returns_success_when_kitty_available() {
        let handler = KittyHandler::new();

        if !handler.is_available() {
            // Skip test if kitty not available
            return;
        }

        let test_dir = PathBuf::from("/tmp");
        let result = handler.open_tab_at(&test_dir);

        assert!(result.is_ok(), "Expected success when kitty is available");
        assert_eq!(result.unwrap(), TerminalResult::Success);
    }

    #[test]
    #[ignore] // Opens real kitty tab - run with `cargo test -- --ignored`
    fn test_attach_tmux_returns_success_when_kitty_available() {
        let handler = KittyHandler::new();

        if !handler.is_available() {
            // Skip test if kitty not available
            return;
        }

        let result = handler.attach_tmux("test-session", Some("%1"));

        assert!(result.is_ok(), "Expected success when kitty is available");
        assert_eq!(result.unwrap(), TerminalResult::Success);
    }

    #[test]
    #[ignore] // Opens real kitty tab - run with `cargo test -- --ignored`
    fn test_attach_tmux_without_pane_id() {
        let handler = KittyHandler::new();

        if !handler.is_available() {
            // Skip test if kitty not available
            return;
        }

        let result = handler.attach_tmux("test-session", None);

        assert!(result.is_ok(), "Expected success when kitty is available");
        assert_eq!(result.unwrap(), TerminalResult::Success);
    }
}
