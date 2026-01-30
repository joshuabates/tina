//! Fallback terminal handler

use std::path::Path;

use super::{TerminalHandler, TerminalResult};

/// Fallback handler that returns commands to user
pub struct FallbackHandler;

impl TerminalHandler for FallbackHandler {
    fn is_available(&self) -> bool {
        true
    }

    fn open_tab_at(&self, cwd: &Path) -> anyhow::Result<TerminalResult> {
        let cwd_str = cwd.display();
        Ok(TerminalResult::ShowCommand {
            command: format!("cd {}", cwd_str),
            description: format!("Open a new terminal tab and navigate to {}", cwd_str),
        })
    }

    fn attach_tmux(
        &self,
        session_name: &str,
        pane_id: Option<&str>,
    ) -> anyhow::Result<TerminalResult> {
        let command = if let Some(pane) = pane_id {
            format!(
                "tmux attach -t {} && tmux select-pane -t {}",
                session_name, pane
            )
        } else {
            format!("tmux attach -t {}", session_name)
        };

        let description = if pane_id.is_some() {
            format!("Attach to tmux session '{}' and select pane", session_name)
        } else {
            format!("Attach to tmux session '{}'", session_name)
        };

        Ok(TerminalResult::ShowCommand {
            command,
            description,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_fallback_is_always_available() {
        let handler = FallbackHandler;
        assert!(
            handler.is_available(),
            "Fallback handler should always be available"
        );
    }

    #[test]
    fn test_open_tab_at_returns_show_command() {
        let handler = FallbackHandler;
        let test_dir = PathBuf::from("/tmp/test-dir");

        let result = handler.open_tab_at(&test_dir);

        assert!(result.is_ok(), "Expected success");

        match result.unwrap() {
            TerminalResult::ShowCommand {
                command,
                description,
            } => {
                assert!(
                    command.contains("/tmp/test-dir"),
                    "Command should contain the directory path"
                );
                assert!(!description.is_empty(), "Description should not be empty");
            }
            TerminalResult::Success => panic!("Expected ShowCommand, got Success"),
        }
    }

    #[test]
    fn test_attach_tmux_with_pane_returns_show_command() {
        let handler = FallbackHandler;

        let result = handler.attach_tmux("test-session", Some("%1"));

        assert!(result.is_ok(), "Expected success");

        match result.unwrap() {
            TerminalResult::ShowCommand {
                command,
                description,
            } => {
                assert!(
                    command.contains("test-session"),
                    "Command should contain session name"
                );
                assert!(command.contains("%1"), "Command should contain pane ID");
                assert!(!description.is_empty(), "Description should not be empty");
            }
            TerminalResult::Success => panic!("Expected ShowCommand, got Success"),
        }
    }

    #[test]
    fn test_attach_tmux_without_pane_returns_show_command() {
        let handler = FallbackHandler;

        let result = handler.attach_tmux("test-session", None);

        assert!(result.is_ok(), "Expected success");

        match result.unwrap() {
            TerminalResult::ShowCommand {
                command,
                description,
            } => {
                assert!(
                    command.contains("test-session"),
                    "Command should contain session name"
                );
                assert!(
                    !command.contains("%"),
                    "Command should not contain pane ID placeholder"
                );
                assert!(!description.is_empty(), "Description should not be empty");
            }
            TerminalResult::Success => panic!("Expected ShowCommand, got Success"),
        }
    }
}
