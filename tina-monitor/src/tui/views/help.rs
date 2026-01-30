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
            Span::styled("Orchestration List:", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from("  j / k / Down / Up    Navigate up/down"),
        Line::from("  Enter                Expand orchestration details"),
        Line::from("  r                    Refresh data"),
        Line::from(""),
        Line::from(vec![
            Span::styled("Phase Detail:", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from("  t / Left             Focus tasks pane"),
        Line::from("  m / Right            Focus team members pane"),
        Line::from("  j / k                Navigate within focused pane"),
        Line::from("  Enter                Open task inspector (when task focused)"),
        Line::from("  l                    View agent logs (when member focused)"),
        Line::from("  Esc                  Return to orchestration list"),
        Line::from(""),
        Line::from(vec![
            Span::styled("Task Inspector:", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from("  Esc / Enter          Close inspector"),
        Line::from(""),
        Line::from(vec![
            Span::styled("Log Viewer:", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from("  j / k                Scroll up/down"),
        Line::from("  d / u                Page down/up"),
        Line::from("  Esc                  Close log viewer"),
        Line::from(""),
        Line::from(vec![
            Span::styled("Global:", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from("  ?                    Toggle this help"),
        Line::from("  q / Ctrl+C           Quit"),
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

    #[test]
    fn test_help_modal_renders_all_sections() {
        let backend = TestBackend::new(80, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| render_help(frame));
        assert!(result.is_ok(), "Help modal should render all sections without panic");
    }

    #[test]
    fn test_help_modal_fits_in_reasonable_terminal_sizes() {
        // Test various common terminal sizes
        for (width, height) in [(80, 24), (120, 40), (100, 30)] {
            let backend = TestBackend::new(width, height);
            let mut terminal = Terminal::new(backend).unwrap();

            let result = terminal.draw(|frame| render_help(frame));
            assert!(
                result.is_ok(),
                "Help modal should fit in terminal of size {}x{}",
                width,
                height
            );
        }
    }
}
