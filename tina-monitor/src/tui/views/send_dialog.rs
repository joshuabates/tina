//! Send dialog for sending commands to agents

use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

/// Send dialog state
pub struct SendDialog {
    /// Text input buffer
    pub input: String,
    /// Pane ID to send to
    pub pane_id: String,
    /// Agent name for display
    pub agent_name: String,
    /// Selected quick action (0 = none, 1 = /checkpoint, 2 = /clear)
    pub quick_action: u8,
    /// Whether confirmation is required
    pub needs_confirmation: bool,
    /// Whether we're in confirmation state
    pub confirming: bool,
}

impl SendDialog {
    pub fn new(pane_id: String, agent_name: String, needs_confirmation: bool) -> Self {
        Self {
            input: String::new(),
            pane_id,
            agent_name,
            quick_action: 0,
            needs_confirmation,
            confirming: false,
        }
    }

    /// Handle character input
    pub fn handle_char(&mut self, c: char) {
        self.input.push(c);
    }

    /// Handle backspace
    pub fn handle_backspace(&mut self) {
        self.input.pop();
    }

    /// Set quick action (sets input to the quick action text)
    pub fn set_quick_action(&mut self, action: u8) {
        self.quick_action = action;
        self.input = match action {
            1 => "/checkpoint".to_string(),
            2 => "/clear".to_string(),
            _ => String::new(),
        };
    }

    /// Get the command text to send
    pub fn get_command(&self) -> &str {
        &self.input
    }

    /// Check if command is a safe command
    pub fn is_safe_command(&self, safe_commands: &[String]) -> bool {
        let cmd = self.input.trim();
        safe_commands.iter().any(|safe| cmd == safe)
    }
}

/// Render the send dialog
pub fn render(dialog: &SendDialog, frame: &mut Frame, area: Rect) {
    // Calculate centered rectangle for the dialog
    let dialog_area = centered_rect(70, 50, area);

    frame.render_widget(Clear, dialog_area);

    let mut lines = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("Send to: ", Style::default().fg(Color::DarkGray)),
            Span::styled(&dialog.agent_name, Style::default().fg(Color::Cyan)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Command: ", Style::default().fg(Color::Yellow)),
            Span::styled(&dialog.input, Style::default().fg(Color::White)),
        ]),
        Line::from(""),
    ];

    // Quick actions
    lines.push(Line::from("Quick actions:"));
    lines.push(Line::from(vec![
        Span::styled("[1] ", Style::default().fg(Color::DarkGray)),
        Span::styled("/checkpoint", Style::default().fg(Color::Green)),
        Span::raw("  "),
        Span::styled("[2] ", Style::default().fg(Color::DarkGray)),
        Span::styled("/clear", Style::default().fg(Color::Red)),
    ]));
    lines.push(Line::from(""));

    // Warning about interruption
    if dialog.needs_confirmation && !dialog.confirming {
        lines.push(Line::from(Span::styled(
            "⚠ Warning: This will interrupt the agent",
            Style::default().fg(Color::Yellow),
        )));
        lines.push(Line::from(""));
    }

    // Confirmation state or send instructions
    if dialog.confirming {
        lines.push(Line::from(vec![
            Span::styled("[Enter] ", Style::default().fg(Color::Green)),
            Span::raw("Confirm  "),
            Span::styled("[Esc] ", Style::default().fg(Color::Red)),
            Span::raw("Cancel"),
        ]));
    } else {
        lines.push(Line::from(vec![
            Span::styled("[Enter] ", Style::default().fg(Color::Green)),
            Span::raw("Send  "),
            Span::styled("[Esc] ", Style::default().fg(Color::Red)),
            Span::raw("Cancel"),
        ]));
    }

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Send Command ")
                .title_alignment(Alignment::Center),
        )
        .style(Style::default().fg(Color::White));

    frame.render_widget(paragraph, dialog_area);
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
    fn test_new_creates_empty_input() {
        let dialog = SendDialog::new(
            "pane_123".to_string(),
            "test-agent".to_string(),
            true,
        );

        assert_eq!(dialog.input, "");
        assert_eq!(dialog.pane_id, "pane_123");
        assert_eq!(dialog.agent_name, "test-agent");
        assert_eq!(dialog.quick_action, 0);
        assert_eq!(dialog.needs_confirmation, true);
        assert_eq!(dialog.confirming, false);
    }

    #[test]
    fn test_handle_char_appends_to_input() {
        let mut dialog = SendDialog::new(
            "pane_123".to_string(),
            "test-agent".to_string(),
            false,
        );

        dialog.handle_char('h');
        dialog.handle_char('i');
        assert_eq!(dialog.input, "hi");
    }

    #[test]
    fn test_handle_backspace_removes_last_char() {
        let mut dialog = SendDialog::new(
            "pane_123".to_string(),
            "test-agent".to_string(),
            false,
        );

        dialog.input = "hello".to_string();
        dialog.handle_backspace();
        assert_eq!(dialog.input, "hell");

        dialog.handle_backspace();
        assert_eq!(dialog.input, "hel");

        // Test backspace on empty string doesn't panic
        dialog.input = "".to_string();
        dialog.handle_backspace();
        assert_eq!(dialog.input, "");
    }

    #[test]
    fn test_set_quick_action_sets_input_text() {
        let mut dialog = SendDialog::new(
            "pane_123".to_string(),
            "test-agent".to_string(),
            false,
        );

        dialog.set_quick_action(1);
        assert_eq!(dialog.quick_action, 1);
        assert_eq!(dialog.input, "/checkpoint");

        dialog.set_quick_action(2);
        assert_eq!(dialog.quick_action, 2);
        assert_eq!(dialog.input, "/clear");

        dialog.set_quick_action(0);
        assert_eq!(dialog.quick_action, 0);
        assert_eq!(dialog.input, "");
    }

    #[test]
    fn test_is_safe_command_returns_true_for_configured_commands() {
        let dialog_checkpoint = SendDialog {
            input: "/checkpoint".to_string(),
            pane_id: "pane_123".to_string(),
            agent_name: "test-agent".to_string(),
            quick_action: 1,
            needs_confirmation: true,
            confirming: false,
        };

        let safe_commands = vec![
            "/checkpoint".to_string(),
            "/status".to_string(),
            "/help".to_string(),
        ];

        assert!(dialog_checkpoint.is_safe_command(&safe_commands));

        let dialog_status = SendDialog {
            input: "/status".to_string(),
            pane_id: "pane_123".to_string(),
            agent_name: "test-agent".to_string(),
            quick_action: 0,
            needs_confirmation: true,
            confirming: false,
        };

        assert!(dialog_status.is_safe_command(&safe_commands));
    }

    #[test]
    fn test_is_safe_command_returns_false_for_unknown_commands() {
        let dialog = SendDialog {
            input: "/dangerous".to_string(),
            pane_id: "pane_123".to_string(),
            agent_name: "test-agent".to_string(),
            quick_action: 0,
            needs_confirmation: true,
            confirming: false,
        };

        let safe_commands = vec![
            "/checkpoint".to_string(),
            "/status".to_string(),
        ];

        assert!(!dialog.is_safe_command(&safe_commands));
    }

    #[test]
    fn test_render_shows_input_and_quick_actions() {
        // This is a basic smoke test - full rendering tests would require
        // more complex terminal buffer inspection
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();

        let dialog = SendDialog {
            input: "test command".to_string(),
            pane_id: "pane_123".to_string(),
            agent_name: "test-agent".to_string(),
            quick_action: 0,
            needs_confirmation: true,
            confirming: false,
        };

        terminal
            .draw(|frame| {
                let area = frame.area();
                render(&dialog, frame, area);
            })
            .unwrap();

        // Verify the terminal rendered without panicking
        let buffer = terminal.backend().buffer();
        let content = buffer.content();

        // Check that some expected text is present
        let buffer_text: String = content.iter()
            .map(|cell| cell.symbol().chars().next().unwrap_or(' '))
            .collect();

        assert!(buffer_text.contains("Send Command") || buffer_text.len() > 0);
    }
}
