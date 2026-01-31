use crossterm::event::{KeyCode, KeyEvent};
use ratatui::Frame;

use crate::layout::PanelGrid;

/// App represents the minimal app shell
pub struct App {
    grid: PanelGrid,
    should_quit: bool,
}

impl App {
    /// Create a new App instance
    pub fn new() -> Self {
        Self {
            grid: PanelGrid::new(),
            should_quit: false,
        }
    }

    /// Handle a key event
    pub fn handle_key(&mut self, key: KeyEvent) {
        // Global keys first
        match key.code {
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Esc => self.should_quit = true,
            _ => {
                // Non-global keys delegated to grid
                self.grid.handle_key(key);
            }
        }
    }

    /// Render the app to the frame
    pub fn render(&self, frame: &mut Frame) {
        let area = frame.area();
        self.grid.render(frame, area);
    }

    /// Check if app should quit
    pub fn should_quit(&self) -> bool {
        self.should_quit
    }

    /// Get the current panel focus position
    pub fn get_panel_focus(&self) -> (usize, usize) {
        self.grid.focus()
    }
}

impl Default for App {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crossterm::event::KeyModifiers;

    fn make_key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    // ====================================================================
    // Creation Tests
    // ====================================================================

    #[test]
    fn new_app_created_successfully() {
        let app = App::new();
        assert!(!app.should_quit);
    }

    #[test]
    fn default_creates_app() {
        let app = App::default();
        assert!(!app.should_quit);
    }

    // ====================================================================
    // Global Quit Key Tests
    // ====================================================================

    #[test]
    fn q_key_sets_should_quit() {
        let mut app = App::new();
        app.handle_key(make_key(KeyCode::Char('q')));
        assert!(app.should_quit());
    }

    #[test]
    fn esc_key_sets_should_quit() {
        let mut app = App::new();
        app.handle_key(make_key(KeyCode::Esc));
        assert!(app.should_quit());
    }

    #[test]
    fn q_key_sets_should_quit_from_any_panel() {
        let mut app = App::new();
        // Focus is at (0,0) by default
        app.handle_key(make_key(KeyCode::Char('q')));
        assert!(app.should_quit());
    }

    #[test]
    fn esc_key_sets_should_quit_from_any_panel() {
        let mut app = App::new();
        // Focus is at (0,0) by default
        app.handle_key(make_key(KeyCode::Esc));
        assert!(app.should_quit());
    }

    // ====================================================================
    // Non-Global Key Delegation Tests
    // ====================================================================

    #[test]
    fn navigation_keys_delegated_to_grid() {
        let mut app = App::new();
        let initial_focus = app.grid.focus();

        // Right arrow should move focus in grid
        app.handle_key(make_key(KeyCode::Right));

        // Focus should change (from (0,0) to (0,1))
        assert_ne!(
            app.grid.focus(),
            initial_focus,
            "Right arrow should move focus via grid"
        );
    }

    #[test]
    fn vim_navigation_keys_delegated_to_grid() {
        let mut app = App::new();
        let initial_focus = app.grid.focus();

        // 'l' should move right
        app.handle_key(make_key(KeyCode::Char('l')));

        assert_ne!(
            app.grid.focus(),
            initial_focus,
            "'l' key should move focus via grid"
        );
    }

    #[test]
    fn unknown_keys_delegated_to_grid() {
        let mut app = App::new();
        // This should not panic or crash
        app.handle_key(make_key(KeyCode::F(1)));
        // Should still not quit
        assert!(!app.should_quit());
    }

    // ====================================================================
    // should_quit Tests
    // ====================================================================

    #[test]
    fn should_quit_returns_false_initially() {
        let app = App::new();
        assert!(!app.should_quit());
    }

    #[test]
    fn should_quit_returns_true_after_q() {
        let mut app = App::new();
        app.handle_key(make_key(KeyCode::Char('q')));
        assert!(app.should_quit());
    }

    #[test]
    fn should_quit_returns_true_after_esc() {
        let mut app = App::new();
        app.handle_key(make_key(KeyCode::Esc));
        assert!(app.should_quit());
    }

    // ====================================================================
    // Global Key Priority Tests
    // ====================================================================

    #[test]
    fn q_key_is_global_not_delegated_to_grid() {
        let mut app = App::new();
        // Set focus to a specific position
        app.grid.set_focus((1, 1));
        let original_focus = app.grid.focus();

        // 'q' should quit, not move focus
        app.handle_key(make_key(KeyCode::Char('q')));

        // Focus should not change
        assert_eq!(
            app.grid.focus(),
            original_focus,
            "q key should quit, not affect grid"
        );
        assert!(app.should_quit());
    }

    #[test]
    fn esc_key_is_global_not_delegated_to_grid() {
        let mut app = App::new();
        // Set focus to a specific position
        app.grid.set_focus((1, 1));
        let original_focus = app.grid.focus();

        // Esc should quit, not move focus
        app.handle_key(make_key(KeyCode::Esc));

        // Focus should not change
        assert_eq!(
            app.grid.focus(),
            original_focus,
            "Esc key should quit, not affect grid"
        );
        assert!(app.should_quit());
    }

    // ====================================================================
    // Multiple Key Presses Tests
    // ====================================================================

    #[test]
    fn multiple_navigation_keys_update_focus() {
        let mut app = App::new();
        assert_eq!(app.grid.focus(), (0, 0));

        // Press right
        app.handle_key(make_key(KeyCode::Right));
        assert_eq!(app.grid.focus(), (0, 1));

        // Press down
        app.handle_key(make_key(KeyCode::Down));
        assert_eq!(app.grid.focus(), (1, 1));

        // Should not have quit
        assert!(!app.should_quit());
    }

    #[test]
    fn quit_key_after_navigation() {
        let mut app = App::new();

        // Navigate
        app.handle_key(make_key(KeyCode::Right));
        assert!(!app.should_quit());

        // Then quit
        app.handle_key(make_key(KeyCode::Char('q')));
        assert!(app.should_quit());
    }
}
