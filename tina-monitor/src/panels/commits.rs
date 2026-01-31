use crate::panel::{Panel, HandleResult, Direction};
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::Frame;

pub struct CommitsPanel {
    title: &'static str,
    pub items: Vec<String>,
    pub selected: usize,
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

    fn render(&self, frame: &mut Frame, area: Rect, _focused: bool) {
        // Placeholder render implementation
        let paragraph = ratatui::widgets::Paragraph::new(self.title);
        frame.render_widget(paragraph, area);
    }

    fn name(&self) -> &'static str {
        self.title
    }
}
