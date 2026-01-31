//! Help overlay showing keybindings

use super::centered_rect;
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    layout::Alignment,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

/// Render the help overlay
pub fn render(frame: &mut Frame) {
    let area = centered_rect(60, 70, frame.area());
    frame.render_widget(Clear, area);

    let help = Paragraph::new(help_text())
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Help ")
                .title_alignment(Alignment::Center),
        )
        .style(Style::default().fg(Color::White));

    frame.render_widget(help, area);
}

fn section_header(title: &'static str) -> Line<'static> {
    Line::from(Span::styled(title, Style::default().add_modifier(Modifier::BOLD)))
}

fn help_text() -> Vec<Line<'static>> {
    vec![
        section_header("Navigation"),
        Line::from("  h/j/k/l or arrows   Move between panels"),
        Line::from("  Space               Quicklook selected item"),
        Line::from(""),
        section_header("Team Members"),
        Line::from("  a                   Attach to tmux session"),
        Line::from("  s                   Send command dialog"),
        Line::from(""),
        section_header("Tasks"),
        Line::from("  i                   Inspect task details"),
        Line::from("  o                   Jump to task owner"),
        Line::from(""),
        section_header("Commits"),
        Line::from("  d                   View diff"),
        Line::from("  y                   Copy SHA"),
        Line::from(""),
        section_header("Global"),
        Line::from("  /                   Fuzzy find orchestration"),
        Line::from("  ?                   This help screen"),
        Line::from("  q / Esc             Quit / close overlay"),
    ]
}

/// Handle key input for help overlay
/// Returns true if the overlay should close
pub fn handle_key(key: KeyEvent) -> bool {
    matches!(
        key.code,
        KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('?')
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crossterm::event::KeyModifiers;
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;

    fn make_key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    #[test]
    fn render_does_not_panic() {
        let backend = TestBackend::new(80, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            render(frame);
        });

        assert!(result.is_ok());
    }

    #[test]
    fn esc_closes_help() {
        assert!(handle_key(make_key(KeyCode::Esc)));
    }

    #[test]
    fn q_closes_help() {
        assert!(handle_key(make_key(KeyCode::Char('q'))));
    }

    #[test]
    fn question_mark_closes_help() {
        assert!(handle_key(make_key(KeyCode::Char('?'))));
    }

    #[test]
    fn other_keys_do_not_close_help() {
        assert!(!handle_key(make_key(KeyCode::Char('a'))));
        assert!(!handle_key(make_key(KeyCode::Enter)));
        assert!(!handle_key(make_key(KeyCode::Down)));
    }
}
