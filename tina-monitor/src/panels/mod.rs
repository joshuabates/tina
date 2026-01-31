mod team;
mod tasks;
mod commits;

pub use team::TeamPanel;
pub use tasks::TasksPanel;
pub use commits::CommitsPanel;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::panel::{Panel, HandleResult, Direction};
    use crossterm::event::{KeyEvent, KeyCode, KeyModifiers};

    fn make_key_event(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    // TeamPanel tests
    #[test]
    fn team_panel_navigates_down_within_items() {
        let mut panel = TeamPanel::new();
        let initial = panel.selected;
        let result = panel.handle_key(make_key_event(KeyCode::Down));
        assert_eq!(result, HandleResult::Consumed);
        assert_eq!(panel.selected, initial + 1);
    }

    #[test]
    fn team_panel_navigates_up_within_items() {
        let mut panel = TeamPanel::new();
        panel.selected = 2;
        let result = panel.handle_key(make_key_event(KeyCode::Up));
        assert_eq!(result, HandleResult::Consumed);
        assert_eq!(panel.selected, 1);
    }

    #[test]
    fn team_panel_moves_focus_down_at_bottom() {
        let mut panel = TeamPanel::new();
        panel.selected = panel.items.len().saturating_sub(1);
        let result = panel.handle_key(make_key_event(KeyCode::Down));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Down));
    }

    #[test]
    fn team_panel_moves_focus_up_at_top() {
        let mut panel = TeamPanel::new();
        panel.selected = 0;
        let result = panel.handle_key(make_key_event(KeyCode::Up));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Up));
    }

    #[test]
    fn team_panel_moves_focus_left() {
        let mut panel = TeamPanel::new();
        let result = panel.handle_key(make_key_event(KeyCode::Left));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Left));
    }

    #[test]
    fn team_panel_moves_focus_right() {
        let mut panel = TeamPanel::new();
        let result = panel.handle_key(make_key_event(KeyCode::Right));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Right));
    }

    #[test]
    fn team_panel_j_key_navigates_down() {
        let mut panel = TeamPanel::new();
        let initial = panel.selected;
        let result = panel.handle_key(make_key_event(KeyCode::Char('j')));
        assert_eq!(result, HandleResult::Consumed);
        assert_eq!(panel.selected, initial + 1);
    }

    #[test]
    fn team_panel_k_key_navigates_up() {
        let mut panel = TeamPanel::new();
        panel.selected = 2;
        let result = panel.handle_key(make_key_event(KeyCode::Char('k')));
        assert_eq!(result, HandleResult::Consumed);
        assert_eq!(panel.selected, 1);
    }

    #[test]
    fn team_panel_h_key_moves_focus_left() {
        let mut panel = TeamPanel::new();
        let result = panel.handle_key(make_key_event(KeyCode::Char('h')));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Left));
    }

    #[test]
    fn team_panel_l_key_moves_focus_right() {
        let mut panel = TeamPanel::new();
        let result = panel.handle_key(make_key_event(KeyCode::Char('l')));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Right));
    }

    #[test]
    fn team_panel_ignores_unknown_keys() {
        let mut panel = TeamPanel::new();
        let result = panel.handle_key(make_key_event(KeyCode::F(1)));
        assert_eq!(result, HandleResult::Ignored);
    }

    #[test]
    fn team_panel_has_correct_name() {
        let panel = TeamPanel::new();
        assert!(!panel.name().is_empty());
    }

    // TasksPanel tests
    #[test]
    fn tasks_panel_navigates_down_within_items() {
        let mut panel = TasksPanel::new();
        let initial = panel.selected;
        let result = panel.handle_key(make_key_event(KeyCode::Down));
        assert_eq!(result, HandleResult::Consumed);
        assert_eq!(panel.selected, initial + 1);
    }

    #[test]
    fn tasks_panel_moves_focus_down_at_bottom() {
        let mut panel = TasksPanel::new();
        panel.selected = panel.items.len().saturating_sub(1);
        let result = panel.handle_key(make_key_event(KeyCode::Down));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Down));
    }

    #[test]
    fn tasks_panel_moves_focus_up_at_top() {
        let mut panel = TasksPanel::new();
        panel.selected = 0;
        let result = panel.handle_key(make_key_event(KeyCode::Up));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Up));
    }

    #[test]
    fn tasks_panel_has_correct_name() {
        let panel = TasksPanel::new();
        assert_eq!(panel.name(), "Tasks");
    }

    // CommitsPanel tests
    #[test]
    fn commits_panel_navigates_down_within_items() {
        let mut panel = CommitsPanel::new();
        let initial = panel.selected;
        let result = panel.handle_key(make_key_event(KeyCode::Down));
        assert_eq!(result, HandleResult::Consumed);
        assert_eq!(panel.selected, initial + 1);
    }

    #[test]
    fn commits_panel_moves_focus_down_at_bottom() {
        let mut panel = CommitsPanel::new();
        panel.selected = panel.items.len().saturating_sub(1);
        let result = panel.handle_key(make_key_event(KeyCode::Down));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Down));
    }

    #[test]
    fn commits_panel_moves_focus_up_at_top() {
        let mut panel = CommitsPanel::new();
        panel.selected = 0;
        let result = panel.handle_key(make_key_event(KeyCode::Up));
        assert_eq!(result, HandleResult::MoveFocus(Direction::Up));
    }

    #[test]
    fn commits_panel_has_correct_name() {
        let panel = CommitsPanel::new();
        assert_eq!(panel.name(), "Commits");
    }
}
