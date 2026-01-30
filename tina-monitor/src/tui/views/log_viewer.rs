//! Log viewer modal for displaying agent logs from tmux panes

use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};

use crate::tui::app::{App, ViewState};

/// Number of log lines to capture from tmux pane
pub const LOG_LINES: usize = 100;

/// Render the log viewer modal (placeholder while team loading not implemented)
pub fn render(app: &App, frame: &mut Frame) {
    // Extract agent_index and scroll_offset from ViewState
    let (agent_index, _scroll_offset) = match app.view_state {
        ViewState::LogViewer { agent_index, scroll_offset } => (agent_index, scroll_offset),
        _ => return, // Not in log viewer state
    };

    let area = centered_rect(85, 85, frame.area());

    // Clear the area first
    frame.render_widget(Clear, area);

    let mut lines = Vec::new();

    // Placeholder text
    lines.push(Line::from(""));
    lines.push(Line::from("Feature not yet implemented"));
    lines.push(Line::from(""));
    lines.push(Line::from("Team loading is required to display agent logs."));
    lines.push(Line::from(""));
    lines.push(Line::from(""));

    // Keybinding hints
    lines.push(Line::from(Span::styled(
        "[j/k] Scroll  [f] Follow  [a] Attach  [ESC] Close",
        Style::default().fg(Color::DarkGray),
    )));

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" Agent {} Logs ", agent_index))
                .title_alignment(Alignment::Center),
        )
        .wrap(Wrap { trim: true })
        .style(Style::default().fg(Color::White));

    frame.render_widget(paragraph, area);
}

/// Render log viewer with actual pane content
pub fn render_with_pane(_pane_id: &str, _agent_name: &str, _scroll_offset: usize, _frame: &mut Frame) {
    // Implementation will go here
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
    use crate::data::discovery::{Orchestration, OrchestrationStatus};
    use crate::tui::app::{App, ViewState};
    use ratatui::{backend::TestBackend, Terminal};

    #[test]
    fn test_log_viewer_renders_placeholder_when_team_not_loaded() {
        let backend = TestBackend::new(100, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let orchestrations = vec![Orchestration {
            team_name: "test-project".to_string(),
            title: "Test Project".to_string(),
            cwd: "/tmp/test".into(),
            current_phase: 1,
            total_phases: 3,
            design_doc_path: "/tmp/test/design.md".into(),
            context_percent: None,
            status: OrchestrationStatus::Idle,
            tasks: vec![],
        }];

        let mut app = App::new_with_orchestrations(orchestrations);
        app.view_state = ViewState::LogViewer {
            agent_index: 0,
            scroll_offset: 0,
        };

        let result = terminal.draw(|frame| render(&app, frame));
        assert!(result.is_ok(), "Log viewer should render without panic");

        let buffer = terminal.backend().buffer();
        let content = buffer.content().iter().map(|c| c.symbol()).collect::<String>();

        // Should show placeholder text
        assert!(content.contains("not yet implemented"), "Should show placeholder text");
        assert!(content.contains("[j/k]"), "Should show scroll keybinding hints");
        assert!(content.contains("[f]"), "Should show follow keybinding hint");
        assert!(content.contains("[a]"), "Should show attach keybinding hint");
        assert!(content.contains("[ESC]"), "Should show close keybinding hint");
    }

    #[test]
    fn test_centered_rect_produces_reasonable_dimensions() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };

        let result = centered_rect(85, 85, area);

        // 85% of 100 = 85, centered means (100 - 85) / 2 = 7.5, rounds to 7 or 8
        assert!(result.x >= 7 && result.x <= 8, "X position should be around 7-8, got {}", result.x);
        assert!(result.y >= 7 && result.y <= 8, "Y position should be around 7-8, got {}", result.y);
        assert_eq!(result.width, 85, "Width should be 85");
        assert_eq!(result.height, 85, "Height should be 85");
    }

    #[test]
    fn test_log_lines_constant_is_100() {
        assert_eq!(LOG_LINES, 100, "LOG_LINES constant should be 100");
    }
}
