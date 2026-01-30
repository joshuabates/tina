//! Help modal view showing keybindings

use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

/// Render the help modal
pub fn render_help(frame: &mut Frame) {
    let area = centered_rect(60, 60, frame.area());

    // Clear the area first
    frame.render_widget(Clear, area);

    let help_text = vec![
        Line::from(vec![
            Span::styled("Navigation", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from(""),
        Line::from("  j / Down     Move down"),
        Line::from("  k / Up       Move up"),
        Line::from("  Enter        Expand/collapse (future)"),
        Line::from(""),
        Line::from(vec![
            Span::styled("Actions", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from(""),
        Line::from("  r            Refresh data"),
        Line::from("  ?            Toggle this help"),
        Line::from("  q / Ctrl+C   Quit"),
    ];

    let help = Paragraph::new(help_text)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Help ")
                .title_alignment(Alignment::Center),
        )
        .style(Style::default().fg(Color::White));

    frame.render_widget(help, area);
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
    use ratatui::{backend::TestBackend, Terminal};

    #[test]
    fn test_render_help_does_not_panic() {
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| render_help(frame));
        assert!(result.is_ok(), "Help modal should render without panic");
    }

    #[test]
    fn test_centered_rect_produces_correct_dimensions() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };

        let result = centered_rect(60, 60, area);

        // With 60% dimensions, the centered rect should be:
        // - 20% offset on each side = 20 units
        // - 60% size = 60 units
        assert_eq!(result.x, 20, "X position should be 20");
        assert_eq!(result.y, 20, "Y position should be 20");
        assert_eq!(result.width, 60, "Width should be 60");
        assert_eq!(result.height, 60, "Height should be 60");
    }

    #[test]
    fn test_centered_rect_handles_small_percentages() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };

        let result = centered_rect(20, 20, area);

        assert_eq!(result.x, 40, "Small rect should be centered");
        assert_eq!(result.y, 40, "Small rect should be centered");
        assert_eq!(result.width, 20, "Width should be 20");
        assert_eq!(result.height, 20, "Height should be 20");
    }

    #[test]
    fn test_centered_rect_handles_large_terminal() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 200,
            height: 80,
        };

        let result = centered_rect(50, 50, area);

        assert_eq!(result.x, 50, "Should center in large terminal");
        assert_eq!(result.y, 20, "Should center in large terminal");
        assert_eq!(result.width, 100, "Width should be 100");
        assert_eq!(result.height, 40, "Height should be 40");
    }

    #[test]
    fn test_render_help_works_on_small_terminal() {
        let backend = TestBackend::new(40, 15);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| render_help(frame));
        assert!(result.is_ok(), "Help modal should render on small terminal");
    }
}
