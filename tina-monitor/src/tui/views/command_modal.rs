//! Command modal for showing fallback commands

use arboard::Clipboard;
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};
use crate::tui::app::{App, ViewState};

/// Command modal state
pub struct CommandModal {
    /// Command to show
    pub command: String,
    /// Description of the command
    pub description: String,
    /// Whether command was copied
    pub copied: bool,
}

impl CommandModal {
    /// Create a new CommandModal
    pub fn new(command: String, description: String) -> Self {
        Self {
            command,
            description,
            copied: false,
        }
    }

    /// Copy command to clipboard
    pub fn copy_to_clipboard(&mut self) -> anyhow::Result<()> {
        let mut clipboard = Clipboard::new()?;
        clipboard.set_text(&self.command)?;
        self.copied = true;
        Ok(())
    }
}

/// Render the command modal
pub fn render(app: &App, frame: &mut Frame) {
    let (command, description, copied) = match &app.view_state {
        ViewState::CommandModal { command, description, copied } => (command, description, copied),
        _ => return,
    };

    let area = centered_rect(70, 40, frame.area());
    frame.render_widget(Clear, area);

    let mut lines = vec![
        Line::from(""),
        Line::from(Span::styled("Command:", Style::default().fg(Color::Yellow))),
        Line::from(command.as_str()),
        Line::from(""),
        Line::from(description.as_str()),
        Line::from(""),
    ];

    if *copied {
        lines.push(Line::from(Span::styled("✓ Copied to clipboard", Style::default().fg(Color::Green))));
    } else {
        lines.push(Line::from(Span::styled("[y] Copy  [Esc] Close", Style::default().fg(Color::DarkGray))));
    }

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Command ")
                .title_alignment(Alignment::Center),
        )
        .style(Style::default().fg(Color::White));

    frame.render_widget(paragraph, area);
}

/// Calculate a centered rectangle with given percentage dimensions
fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_command_modal_new_creates_instance_with_correct_fields() {
        let modal = CommandModal::new(
            "cd /tmp".to_string(),
            "Navigate to /tmp".to_string(),
        );

        assert_eq!(modal.command, "cd /tmp");
        assert_eq!(modal.description, "Navigate to /tmp");
        assert_eq!(modal.copied, false);
    }

    #[test]
    #[ignore] // Clipboard tests can crash in CI/headless environments
    fn test_copy_to_clipboard_sets_copied_flag() {
        let mut modal = CommandModal::new(
            "cd /tmp".to_string(),
            "Navigate to /tmp".to_string(),
        );

        assert_eq!(modal.copied, false);

        let result = modal.copy_to_clipboard();

        // May fail if clipboard not available (CI environment)
        if result.is_ok() {
            assert_eq!(modal.copied, true, "copied flag should be set after successful copy");
        }
    }

    #[test]
    #[ignore] // Clipboard tests can crash in CI/headless environments
    fn test_copy_to_clipboard_copies_command_text() {
        let mut modal = CommandModal::new(
            "cd /tmp/test".to_string(),
            "Navigate to /tmp/test".to_string(),
        );

        let result = modal.copy_to_clipboard();

        // May fail if clipboard not available (CI environment)
        if result.is_ok() {
            // Try to read from clipboard to verify
            if let Ok(mut clipboard) = arboard::Clipboard::new() {
                if let Ok(text) = clipboard.get_text() {
                    assert_eq!(text, "cd /tmp/test", "Clipboard should contain the command");
                }
            }
        }
    }
}
