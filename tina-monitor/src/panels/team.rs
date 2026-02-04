use crate::panel::{Panel, HandleResult, Direction};
use crate::panels::{border_style, border_type};
use crate::types::TeamMember;
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState};
use ratatui::Frame;

pub struct TeamPanel {
    title: &'static str,
    pub members: Vec<TeamMember>,
    pub selected: usize,
}

impl Default for TeamPanel {
    fn default() -> Self {
        Self::new()
    }
}

impl TeamPanel {
    pub fn new() -> Self {
        Self {
            title: "Orchestrator Team",
            members: vec![],
            selected: 0,
        }
    }

    pub fn set_members(&mut self, members: Vec<TeamMember>) {
        self.members = members;
        // Reset selection if out of bounds
        if self.selected >= self.members.len() && !self.members.is_empty() {
            self.selected = self.members.len() - 1;
        } else if self.members.is_empty() {
            self.selected = 0;
        }
    }

    pub fn selected_member(&self) -> Option<&TeamMember> {
        self.members.get(self.selected)
    }
}

fn shorten_model(model: &str) -> String {
    if model.contains("opus") {
        "opus".to_string()
    } else if model.contains("sonnet") {
        "sonnet".to_string()
    } else if model.contains("haiku") {
        "haiku".to_string()
    } else {
        model.to_string()
    }
}

impl Panel for TeamPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        match key.code {
            crossterm::event::KeyCode::Char('j') | crossterm::event::KeyCode::Down => {
                if self.selected < self.members.len().saturating_sub(1) {
                    self.selected += 1;
                    HandleResult::Consumed
                } else {
                    HandleResult::MoveFocus(Direction::Down)
                }
            }
            crossterm::event::KeyCode::Char('k') | crossterm::event::KeyCode::Up => {
                if self.selected > 0 {
                    self.selected -= 1;
                    HandleResult::Consumed
                } else {
                    HandleResult::MoveFocus(Direction::Up)
                }
            }
            crossterm::event::KeyCode::Char('l') | crossterm::event::KeyCode::Right => {
                HandleResult::MoveFocus(Direction::Right)
            }
            crossterm::event::KeyCode::Char('h') | crossterm::event::KeyCode::Left => {
                HandleResult::MoveFocus(Direction::Left)
            }
            _ => HandleResult::Ignored,
        }
    }

    fn render(&self, frame: &mut Frame, area: Rect, focused: bool) {
        let block = Block::default()
            .title(self.title)
            .borders(Borders::ALL)
            .border_type(border_type(focused))
            .border_style(border_style(focused));

        let items: Vec<ListItem> = if self.members.is_empty() {
            vec![ListItem::new("No team members")]
        } else {
            self.members
                .iter()
                .map(|member| {
                    let active_indicator = if member.tmux_pane_id.is_some() {
                        "● "
                    } else {
                        "○ "
                    };
                    let model_short = shorten_model(&member.model);
                    let line = Line::from(vec![
                        Span::raw(active_indicator),
                        Span::styled(&member.name, Style::default().add_modifier(Modifier::BOLD)),
                        Span::raw(format!(" ({})", model_short)),
                    ]);
                    ListItem::new(line)
                })
                .collect()
        };

        let list = List::new(items)
            .block(block)
            .highlight_style(Style::default().bg(Color::DarkGray));

        let mut state = ListState::default();
        if !self.members.is_empty() {
            state.select(Some(self.selected));
        }

        frame.render_stateful_widget(list, area, &mut state);
    }

    fn name(&self) -> &'static str {
        self.title
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn create_test_member(name: &str, model: &str, pane_id: Option<String>) -> TeamMember {
        TeamMember {
            agent_id: format!("agent-{}", name),
            name: name.to_string(),
            agent_type: Some("test-type".to_string()),
            model: model.to_string(),
            joined_at: 0,
            tmux_pane_id: pane_id,
            cwd: PathBuf::from("/test"),
            subscriptions: vec![],
        }
    }

    #[test]
    fn set_members_stores_members() {
        let mut panel = TeamPanel::new();
        let members = vec![
            create_test_member("alice", "claude-opus-4", Some("0".to_string())),
            create_test_member("bob", "claude-sonnet-4", None),
        ];

        panel.set_members(members.clone());

        assert_eq!(panel.members.len(), 2);
        assert_eq!(panel.members[0].name, "alice");
        assert_eq!(panel.members[1].name, "bob");
    }

    #[test]
    fn selected_member_returns_current_selection() {
        let mut panel = TeamPanel::new();
        let members = vec![
            create_test_member("alice", "claude-opus-4", Some("0".to_string())),
            create_test_member("bob", "claude-sonnet-4", None),
        ];
        panel.set_members(members);

        let selected = panel.selected_member();
        assert!(selected.is_some());
        assert_eq!(selected.unwrap().name, "alice");
    }

    #[test]
    fn selected_member_returns_none_when_empty() {
        let panel = TeamPanel::new();
        assert!(panel.selected_member().is_none());
    }

    #[test]
    fn set_members_resets_selection_when_out_of_bounds() {
        let mut panel = TeamPanel::new();
        let initial_members = vec![
            create_test_member("alice", "claude-opus-4", Some("0".to_string())),
            create_test_member("bob", "claude-sonnet-4", None),
            create_test_member("charlie", "claude-haiku-3", None),
        ];
        panel.set_members(initial_members);
        panel.selected = 2; // Select charlie

        let new_members = vec![
            create_test_member("alice", "claude-opus-4", Some("0".to_string())),
        ];
        panel.set_members(new_members);

        // Selection should reset to 0 since old selection is out of bounds
        assert_eq!(panel.selected, 0);
    }

    #[test]
    fn set_members_with_empty_list_resets_selection() {
        let mut panel = TeamPanel::new();
        let members = vec![create_test_member("alice", "claude-opus-4", Some("0".to_string()))];
        panel.set_members(members);
        panel.selected = 0;

        panel.set_members(vec![]);

        assert_eq!(panel.selected, 0);
        assert!(panel.members.is_empty());
    }

    #[test]
    fn shorten_model_handles_opus() {
        assert_eq!(shorten_model("claude-opus-4"), "opus");
        assert_eq!(shorten_model("claude-opus"), "opus");
    }

    #[test]
    fn shorten_model_handles_sonnet() {
        assert_eq!(shorten_model("claude-sonnet-4"), "sonnet");
        assert_eq!(shorten_model("claude-sonnet"), "sonnet");
    }

    #[test]
    fn shorten_model_handles_haiku() {
        assert_eq!(shorten_model("claude-haiku-3"), "haiku");
        assert_eq!(shorten_model("claude-haiku"), "haiku");
    }

    #[test]
    fn shorten_model_returns_original_for_unknown() {
        assert_eq!(shorten_model("unknown-model"), "unknown-model");
    }
}
