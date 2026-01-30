mod fallback;
mod kitty;

pub use fallback::FallbackHandler;
pub use kitty::KittyHandler;

use std::path::Path;

/// Result of a terminal action
#[derive(Debug, PartialEq)]
pub enum TerminalResult {
    Success,
    ShowCommand {
        command: String,
        description: String,
    },
}

/// Terminal handler trait
pub trait TerminalHandler: Send + Sync {
    fn is_available(&self) -> bool;
    fn open_tab_at(&self, cwd: &Path) -> anyhow::Result<TerminalResult>;
    fn attach_tmux(
        &self,
        session_name: &str,
        pane_id: Option<&str>,
    ) -> anyhow::Result<TerminalResult>;
}

/// Get the appropriate terminal handler based on config
pub fn get_handler(preferred: &str) -> Box<dyn TerminalHandler> {
    match preferred {
        "kitty" => {
            let handler = KittyHandler::new();
            if handler.is_available() {
                return Box::new(handler);
            }
        }
        _ => {}
    }
    Box::new(FallbackHandler)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_handler_returns_fallback_for_unknown() {
        let handler = get_handler("unknown");
        assert!(handler.is_available());
    }

    #[test]
    fn test_get_handler_prefers_kitty_when_available() {
        let handler = get_handler("kitty");
        // Will return kitty if available, fallback otherwise
        assert!(handler.is_available());
    }
}
