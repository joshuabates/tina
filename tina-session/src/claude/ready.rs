use std::thread;
use std::time::{Duration, Instant};

use crate::error::{Result, SessionError};
use crate::tmux;

/// Wait for Claude to be ready in a tmux session.
///
/// Polls the tmux pane output looking for:
/// - A line starting with `>` (the prompt)
/// - Text containing "bypass permissions" (ready indicator)
///
/// Returns Ok(()) when ready, or Err on timeout.
pub fn wait_for_ready(session: &str, timeout_secs: u64) -> Result<()> {
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);
    let poll_interval = Duration::from_millis(500);

    loop {
        if start.elapsed() > timeout {
            return Err(SessionError::ClaudeNotReady(timeout_secs));
        }

        match tmux::capture_pane(session) {
            Ok(output) => {
                if is_claude_ready(&output) {
                    return Ok(());
                }
            }
            Err(_) => {
                // Session might not be ready yet, keep trying
            }
        }

        thread::sleep(poll_interval);
    }
}

/// Check if the output indicates Claude is ready.
fn is_claude_ready(output: &str) -> bool {
    for line in output.lines() {
        let trimmed = line.trim();
        // Look for prompt character at start of line
        if trimmed.starts_with('>') || trimmed.starts_with('❯') {
            return true;
        }
        // Look for bypass permissions indicator
        if trimmed.contains("bypass permissions") {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_claude_ready_prompt() {
        assert!(is_claude_ready("> "));
        assert!(is_claude_ready("  > test"));
        assert!(is_claude_ready("❯ "));
    }

    #[test]
    fn test_is_claude_ready_bypass() {
        assert!(is_claude_ready("bypass permissions on (shift+Tab to cycle)"));
        assert!(is_claude_ready(">> bypass permissions on"));
    }

    #[test]
    fn test_is_claude_ready_not_ready() {
        assert!(!is_claude_ready("Loading..."));
        assert!(!is_claude_ready("Starting Claude..."));
        assert!(!is_claude_ready(""));
    }
}
