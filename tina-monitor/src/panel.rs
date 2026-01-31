use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::Frame;

use crate::entity::{Entity, EntityAction};

/// Direction for focus movement
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

/// Result of handling a key event in a panel
#[derive(Debug, Clone, PartialEq)]
pub enum HandleResult {
    /// Key was handled by the panel
    Consumed,
    /// Key is not relevant to the panel
    Ignored,
    /// Request to move focus in a direction
    MoveFocus(Direction),
    /// Request to open quicklook for an entity
    Quicklook(Entity),
    /// Request to perform an action on an entity
    EntityAction(EntityAction),
}

/// Core abstraction for TUI panels
pub trait Panel {
    /// Handle a key event, returning the result
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult;

    /// Render the panel to the given area
    fn render(&self, frame: &mut Frame, area: Rect, focused: bool);

    /// Get the name of this panel
    fn name(&self) -> &'static str;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direction_has_all_variants() {
        let _ = Direction::Up;
        let _ = Direction::Down;
        let _ = Direction::Left;
        let _ = Direction::Right;
    }

    #[test]
    fn handle_result_consumed() {
        let result = HandleResult::Consumed;
        assert!(matches!(result, HandleResult::Consumed));
    }

    #[test]
    fn handle_result_ignored() {
        let result = HandleResult::Ignored;
        assert!(matches!(result, HandleResult::Ignored));
    }

    #[test]
    fn handle_result_move_focus() {
        let result = HandleResult::MoveFocus(Direction::Up);
        assert!(matches!(result, HandleResult::MoveFocus(Direction::Up)));
    }

    #[test]
    fn handle_result_quicklook() {
        let entity = Entity::TeamMember(crate::types::TeamMember {
            agent_id: "test".to_string(),
            name: "test".to_string(),
            agent_type: "test".to_string(),
            model: "test".to_string(),
            tmux_pane_id: None,
            cwd: std::path::PathBuf::from("/test"),
        });
        let result = HandleResult::Quicklook(entity.clone());
        assert!(matches!(result, HandleResult::Quicklook(_)));
        if let HandleResult::Quicklook(e) = result {
            assert_eq!(e, entity);
        }
    }

    #[test]
    fn handle_result_entity_action() {
        let action = EntityAction::CopySha {
            sha: "abc123".to_string(),
        };
        let result = HandleResult::EntityAction(action.clone());
        assert!(matches!(result, HandleResult::EntityAction(_)));
        if let HandleResult::EntityAction(a) = result {
            assert_eq!(a, action);
        }
    }

    #[test]
    fn panel_trait_exists() {
        // This test just verifies we can implement the trait
        struct TestPanel;

        impl Panel for TestPanel {
            fn handle_key(&mut self, _key: KeyEvent) -> HandleResult {
                HandleResult::Consumed
            }

            fn render(
                &self,
                _frame: &mut Frame,
                _area: Rect,
                _focused: bool,
            ) {
            }

            fn name(&self) -> &'static str {
                "test"
            }
        }

        let mut panel = TestPanel;
        // Just verify we can call the methods
        let _result = panel.handle_key(
            KeyEvent::new(
                crossterm::event::KeyCode::Char('a'),
                crossterm::event::KeyModifiers::NONE,
            ),
        );
        assert_eq!(panel.name(), "test");
    }
}
