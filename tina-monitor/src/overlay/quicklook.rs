//! Quicklook overlay for entity details and actions

use super::centered_rect;
use crate::entity::{Entity, EntityAction};
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    layout::Alignment,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

/// State for the quicklook overlay
#[derive(Debug)]
pub struct QuicklookState {
    pub entity: Entity,
}

impl QuicklookState {
    pub fn new(entity: Entity) -> Self {
        Self { entity }
    }
}

/// Result of handling a key in quicklook
#[derive(Debug)]
pub enum QuicklookResult {
    /// Close the overlay
    Close,
    /// Key was consumed but no action needed
    Consumed,
    /// Execute an entity action
    Action(EntityAction),
}

/// Render the quicklook overlay
pub fn render(state: &QuicklookState, frame: &mut Frame) {
    let area = centered_rect(70, 60, frame.area());
    frame.render_widget(Clear, area);

    let mut lines = render_entity_details(&state.entity);

    // Add separator and action hints
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "Actions:",
        Style::default().add_modifier(Modifier::BOLD),
    )));

    let actions = state.entity.available_actions();
    if actions.is_empty() {
        lines.push(Line::from(Span::styled(
            "  (No actions available)",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for (key, label, _action) in &actions {
            lines.push(Line::from(format!("  [{}] {}", key, label)));
        }
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "[Space/Esc] Close",
        Style::default().fg(Color::DarkGray),
    )));

    let title = match &state.entity {
        Entity::TeamMember(m) => format!(" {} ", m.name),
        Entity::Task(t) => format!(" Task: {} ", t.subject),
        Entity::Commit(c) => format!(" {} ", &c.short_hash),
    };

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .title_alignment(Alignment::Center),
        )
        .style(Style::default().fg(Color::White));

    frame.render_widget(paragraph, area);
}

fn render_entity_details(entity: &Entity) -> Vec<Line<'static>> {
    match entity {
        Entity::TeamMember(m) => vec![
            Line::from(vec![
                Span::styled("Name: ", Style::default().fg(Color::DarkGray)),
                Span::raw(m.name.clone()),
            ]),
            Line::from(vec![
                Span::styled("Model: ", Style::default().fg(Color::DarkGray)),
                Span::raw(m.model.clone()),
            ]),
            Line::from(vec![
                Span::styled("Type: ", Style::default().fg(Color::DarkGray)),
                Span::raw(m.agent_type.clone()),
            ]),
            Line::from(vec![
                Span::styled("Pane: ", Style::default().fg(Color::DarkGray)),
                Span::raw(m.tmux_pane_id.clone().unwrap_or_else(|| "N/A".to_string())),
            ]),
        ],
        Entity::Task(t) => {
            let mut lines = vec![
                Line::from(vec![
                    Span::styled("ID: ", Style::default().fg(Color::DarkGray)),
                    Span::raw(t.id.clone()),
                ]),
                Line::from(vec![
                    Span::styled("Subject: ", Style::default().fg(Color::DarkGray)),
                    Span::raw(t.subject.clone()),
                ]),
                Line::from(vec![
                    Span::styled("Status: ", Style::default().fg(Color::DarkGray)),
                    Span::raw(format!("{:?}", t.status)),
                ]),
                Line::from(vec![
                    Span::styled("Owner: ", Style::default().fg(Color::DarkGray)),
                    Span::raw(t.owner.clone().unwrap_or_else(|| "Unassigned".to_string())),
                ]),
            ];
            if !t.description.is_empty() {
                lines.push(Line::from(""));
                lines.push(Line::from(t.description.clone()));
            }
            lines
        }
        Entity::Commit(c) => vec![
            Line::from(vec![
                Span::styled("SHA: ", Style::default().fg(Color::DarkGray)),
                Span::raw(c.hash.clone()),
            ]),
            Line::from(vec![
                Span::styled("Author: ", Style::default().fg(Color::DarkGray)),
                Span::raw(c.author.clone()),
            ]),
            Line::from(vec![
                Span::styled("Time: ", Style::default().fg(Color::DarkGray)),
                Span::raw(c.relative_time.clone()),
            ]),
            Line::from(""),
            Line::from(c.subject.clone()),
        ],
    }
}

/// Handle key input for quicklook
pub fn handle_key(state: &QuicklookState, key: KeyEvent) -> QuicklookResult {
    match key.code {
        KeyCode::Esc | KeyCode::Char(' ') => QuicklookResult::Close,
        KeyCode::Char(c) => {
            // Check if this matches an action key
            for (action_key, _, action) in state.entity.available_actions() {
                if c == action_key {
                    return QuicklookResult::Action(action);
                }
            }
            QuicklookResult::Consumed
        }
        _ => QuicklookResult::Consumed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::types::{Task, TaskStatus};
    use crate::git::commits::Commit;
    use crate::types::TeamMember;
    use crossterm::event::KeyModifiers;
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;
    use std::path::PathBuf;

    fn make_key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    fn create_team_member() -> TeamMember {
        TeamMember {
            agent_id: "agent-1".to_string(),
            name: "alice".to_string(),
            agent_type: "test".to_string(),
            model: "claude-opus".to_string(),
            tmux_pane_id: Some("0".to_string()),
            cwd: PathBuf::from("/test"),
        }
    }

    fn create_task() -> Task {
        Task {
            id: "task-1".to_string(),
            subject: "Test task".to_string(),
            description: "Description".to_string(),
            active_form: None,
            status: TaskStatus::InProgress,
            owner: Some("alice".to_string()),
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        }
    }

    fn create_commit() -> Commit {
        Commit {
            short_hash: "abc1234".to_string(),
            hash: "abc1234567890".to_string(),
            subject: "Test commit".to_string(),
            author: "Test".to_string(),
            relative_time: "now".to_string(),
        }
    }

    #[test]
    fn render_team_member_does_not_panic() {
        let state = QuicklookState::new(Entity::TeamMember(create_team_member()));
        let backend = TestBackend::new(80, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            render(&state, frame);
        });

        assert!(result.is_ok());
    }

    #[test]
    fn render_task_does_not_panic() {
        let state = QuicklookState::new(Entity::Task(create_task()));
        let backend = TestBackend::new(80, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            render(&state, frame);
        });

        assert!(result.is_ok());
    }

    #[test]
    fn render_commit_does_not_panic() {
        let state = QuicklookState::new(Entity::Commit(create_commit()));
        let backend = TestBackend::new(80, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            render(&state, frame);
        });

        assert!(result.is_ok());
    }

    #[test]
    fn esc_closes_quicklook() {
        let state = QuicklookState::new(Entity::Task(create_task()));
        assert!(matches!(
            handle_key(&state, make_key(KeyCode::Esc)),
            QuicklookResult::Close
        ));
    }

    #[test]
    fn space_closes_quicklook() {
        let state = QuicklookState::new(Entity::Task(create_task()));
        assert!(matches!(
            handle_key(&state, make_key(KeyCode::Char(' '))),
            QuicklookResult::Close
        ));
    }

    #[test]
    fn action_key_returns_action() {
        let member = create_team_member();
        let state = QuicklookState::new(Entity::TeamMember(member));

        // 'a' should trigger attach
        match handle_key(&state, make_key(KeyCode::Char('a'))) {
            QuicklookResult::Action(EntityAction::AttachTmux { .. }) => (),
            other => panic!("Expected AttachTmux action, got {:?}", other),
        }
    }

    #[test]
    fn unknown_key_consumed() {
        let state = QuicklookState::new(Entity::Task(create_task()));
        assert!(matches!(
            handle_key(&state, make_key(KeyCode::Char('z'))),
            QuicklookResult::Consumed
        ));
    }
}
