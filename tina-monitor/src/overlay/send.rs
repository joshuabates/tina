//! Send dialog overlay for sending commands to tmux panes

use super::centered_rect;
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    layout::Alignment,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

/// State for the send dialog overlay
#[derive(Debug)]
pub struct SendDialogState {
    pub input: String,
    pub pane_id: String,
    pub agent_name: String,
}

impl SendDialogState {
    pub fn new(pane_id: String, agent_name: String) -> Self {
        Self {
            input: String::new(),
            pane_id,
            agent_name,
        }
    }
}

/// Result of handling a key in send dialog
#[derive(Debug)]
pub enum SendResult {
    /// Cancel the dialog
    Cancel,
    /// Key was consumed but no action needed
    Consumed,
    /// Send command to pane (pane_id, command)
    Send(String, String),
}

/// Render the send dialog overlay
pub fn render(state: &SendDialogState, frame: &mut Frame) {
    let area = centered_rect(60, 30, frame.area());
    frame.render_widget(Clear, area);

    let lines = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("Send to: ", Style::default().fg(Color::DarkGray)),
            Span::styled(&state.agent_name, Style::default().fg(Color::Cyan)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("> ", Style::default().fg(Color::Yellow)),
            Span::raw(&state.input),
            Span::styled("_", Style::default().fg(Color::White)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("[Enter] ", Style::default().fg(Color::Green)),
            Span::raw("Send  "),
            Span::styled("[Esc] ", Style::default().fg(Color::Red)),
            Span::raw("Cancel"),
        ]),
    ];

    let paragraph = Paragraph::new(lines).block(
        Block::default()
            .borders(Borders::ALL)
            .title(" Send Command ")
            .title_alignment(Alignment::Center),
    );

    frame.render_widget(paragraph, area);
}

/// Handle key input for send dialog
pub fn handle_key(state: &mut SendDialogState, key: KeyEvent) -> SendResult {
    match key.code {
        KeyCode::Esc => SendResult::Cancel,
        KeyCode::Enter => {
            if state.input.is_empty() {
                SendResult::Consumed
            } else {
                SendResult::Send(state.pane_id.clone(), state.input.clone())
            }
        }
        KeyCode::Char(c) => {
            state.input.push(c);
            SendResult::Consumed
        }
        KeyCode::Backspace => {
            state.input.pop();
            SendResult::Consumed
        }
        _ => SendResult::Consumed,
    }
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
    fn new_state_has_empty_input() {
        let state = SendDialogState::new("0".to_string(), "alice".to_string());
        assert!(state.input.is_empty());
        assert_eq!(state.pane_id, "0");
        assert_eq!(state.agent_name, "alice");
    }

    #[test]
    fn esc_cancels_dialog() {
        let mut state = SendDialogState::new("0".to_string(), "alice".to_string());
        assert!(matches!(
            handle_key(&mut state, make_key(KeyCode::Esc)),
            SendResult::Cancel
        ));
    }

    #[test]
    fn enter_with_empty_input_consumed() {
        let mut state = SendDialogState::new("0".to_string(), "alice".to_string());
        assert!(matches!(
            handle_key(&mut state, make_key(KeyCode::Enter)),
            SendResult::Consumed
        ));
    }

    #[test]
    fn enter_with_input_sends() {
        let mut state = SendDialogState::new("0".to_string(), "alice".to_string());
        state.input = "hello".to_string();

        match handle_key(&mut state, make_key(KeyCode::Enter)) {
            SendResult::Send(pane_id, command) => {
                assert_eq!(pane_id, "0");
                assert_eq!(command, "hello");
            }
            other => panic!("Expected Send, got {:?}", other),
        }
    }

    #[test]
    fn char_adds_to_input() {
        let mut state = SendDialogState::new("0".to_string(), "alice".to_string());

        handle_key(&mut state, make_key(KeyCode::Char('h')));
        handle_key(&mut state, make_key(KeyCode::Char('i')));

        assert_eq!(state.input, "hi");
    }

    #[test]
    fn backspace_removes_from_input() {
        let mut state = SendDialogState::new("0".to_string(), "alice".to_string());
        state.input = "hello".to_string();

        handle_key(&mut state, make_key(KeyCode::Backspace));

        assert_eq!(state.input, "hell");
    }

    #[test]
    fn render_does_not_panic() {
        let state = SendDialogState::new("0".to_string(), "alice".to_string());
        let backend = TestBackend::new(80, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            render(&state, frame);
        });

        assert!(result.is_ok());
    }
}
