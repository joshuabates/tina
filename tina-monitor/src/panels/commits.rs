use crate::panel::{Panel, HandleResult, Direction};
use crate::panels::{border_style, border_type};
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState};
use ratatui::Frame;

pub struct CommitsPanel {
    title: &'static str,
    pub items: Vec<String>,
    pub selected: usize,
}

impl Default for CommitsPanel {
    fn default() -> Self {
        Self::new()
    }
}

impl CommitsPanel {
    pub fn new() -> Self {
        Self {
            title: "Commits",
            items: vec![
                "abc1234".to_string(),
                "def5678".to_string(),
                "ghi9012".to_string(),
            ],
            selected: 0,
        }
    }
}

impl Panel for CommitsPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        match key.code {
            crossterm::event::KeyCode::Char('j') | crossterm::event::KeyCode::Down => {
                if self.selected < self.items.len().saturating_sub(1) {
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

        let items: Vec<ListItem> = self.items
            .iter()
            .map(|item| ListItem::new(item.as_str()))
            .collect();

        let list = List::new(items)
            .block(block)
            .highlight_style(Style::default().bg(Color::DarkGray));

        let mut state = ListState::default();
        state.select(Some(self.selected));

        frame.render_stateful_widget(list, area, &mut state);
    }

    fn name(&self) -> &'static str {
        self.title
    }
}
