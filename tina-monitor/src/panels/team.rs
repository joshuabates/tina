use crate::panel::{Panel, HandleResult, Direction};
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::Frame;

pub struct TeamPanel {
    title: &'static str,
    pub items: Vec<String>,
    pub selected: usize,
}

impl TeamPanel {
    pub fn new() -> Self {
        Self {
            title: "Orchestrator Team",
            items: vec![
                "team-lead".to_string(),
                "worker-1".to_string(),
                "worker-2".to_string(),
            ],
            selected: 0,
        }
    }
}

impl Panel for TeamPanel {
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
