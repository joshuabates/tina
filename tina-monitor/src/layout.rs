use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::Frame;

use crate::panel::{Direction, HandleResult, Panel};
use crate::panels::{CommitsPanel, TasksPanel, TeamPanel};

/// Result of handling a key event in the grid
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GridResult {
    /// Key was handled by the grid or its focused panel
    Consumed,
    /// Key is not relevant to the grid
    Ignored,
    /// Request for a global action (Phase 4 overlays)
    GlobalAction(Action),
}

/// Global actions that transcend the grid
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Placeholder for Phase 4
    Placeholder,
}

/// 2x2 grid of panels with focus tracking
pub struct PanelGrid {
    /// 2x2 array of panels: [row][col]
    panels: [[Box<dyn Panel>; 2]; 2],
    /// Current focus position: (row, col)
    focus: (usize, usize),
}

impl PanelGrid {
    /// Create a new PanelGrid with default panels
    pub fn new() -> Self {
        Self {
            panels: [
                [
                    Box::new(TeamPanel::new()),
                    Box::new(TasksPanel::new()),
                ],
                [
                    Box::new(TeamPanel::new()),
                    Box::new(CommitsPanel::new()),
                ],
            ],
            focus: (0, 0),
        }
    }

    /// Get the current focus position
    pub fn focus(&self) -> (usize, usize) {
        self.focus
    }

    /// Set the focus position
    pub fn set_focus(&mut self, pos: (usize, usize)) {
        self.focus = pos;
    }

    /// Move focus in a direction, wrapping at edges
    pub fn move_focus(&mut self, dir: Direction) {
        match dir {
            Direction::Right => {
                self.focus.1 = (self.focus.1 + 1) % 2;
            }
            Direction::Left => {
                self.focus.1 = if self.focus.1 == 0 { 1 } else { 0 };
            }
            Direction::Down => {
                self.focus.0 = (self.focus.0 + 1) % 2;
            }
            Direction::Up => {
                self.focus.0 = if self.focus.0 == 0 { 1 } else { 0 };
            }
        }
    }

    /// Handle a key event
    pub fn handle_key(&mut self, key: KeyEvent) -> GridResult {
        // Check for grid-level navigation keys
        match key.code {
            crossterm::event::KeyCode::Right | crossterm::event::KeyCode::Char('l') => {
                self.move_focus(Direction::Right);
                return GridResult::Consumed;
            }
            crossterm::event::KeyCode::Left | crossterm::event::KeyCode::Char('h') => {
                self.move_focus(Direction::Left);
                return GridResult::Consumed;
            }
            crossterm::event::KeyCode::Down | crossterm::event::KeyCode::Char('j') => {
                self.move_focus(Direction::Down);
                return GridResult::Consumed;
            }
            crossterm::event::KeyCode::Up | crossterm::event::KeyCode::Char('k') => {
                self.move_focus(Direction::Up);
                return GridResult::Consumed;
            }
            _ => {}
        }

        // Delegate to the focused panel
        let (row, col) = self.focus;
        let result = self.panels[row][col].handle_key(key);

        // Handle the panel's result
        match result {
            HandleResult::Consumed => GridResult::Consumed,
            HandleResult::Ignored => GridResult::Ignored,
            HandleResult::MoveFocus(dir) => {
                self.move_focus(dir);
                GridResult::Consumed
            }
        }
    }

    /// Render the grid to the frame
    pub fn render(&self, frame: &mut Frame, area: Rect) {
        // Divide the area into a 2x2 grid
        use ratatui::layout::{Constraint, Direction as LayoutDirection, Layout};

        // Split vertically (rows)
        let [top, bottom] = Layout::default()
            .direction(LayoutDirection::Vertical)
            .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
            .areas(area);

        // Split each row horizontally (columns)
        let [top_left, top_right] = Layout::default()
            .direction(LayoutDirection::Horizontal)
            .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
            .areas(top);

        let [bottom_left, bottom_right] = Layout::default()
            .direction(LayoutDirection::Horizontal)
            .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
            .areas(bottom);

        // Render each panel with focus indication
        let is_focused_00 = self.focus == (0, 0);
        let is_focused_01 = self.focus == (0, 1);
        let is_focused_10 = self.focus == (1, 0);
        let is_focused_11 = self.focus == (1, 1);

        self.panels[0][0].render(frame, top_left, is_focused_00);
        self.panels[0][1].render(frame, top_right, is_focused_01);
        self.panels[1][0].render(frame, bottom_left, is_focused_10);
        self.panels[1][1].render(frame, bottom_right, is_focused_11);
    }
}

impl Default for PanelGrid {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grid_result_consumed() {
        let result = GridResult::Consumed;
        assert!(matches!(result, GridResult::Consumed));
    }

    #[test]
    fn grid_result_ignored() {
        let result = GridResult::Ignored;
        assert!(matches!(result, GridResult::Ignored));
    }

    #[test]
    fn grid_result_global_action() {
        let result = GridResult::GlobalAction(Action::Placeholder);
        assert!(matches!(result, GridResult::GlobalAction(_)));
    }
}
