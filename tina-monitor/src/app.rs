use anyhow::{anyhow, Result};
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::Frame;
use std::path::PathBuf;

use crate::actions;
use crate::dashboard::Dashboard;
use crate::data::{DataSource, LoadedOrchestration};
use crate::git::commits::get_commits;
use crate::layout::PanelGrid;
use crate::overlay::{fuzzy, help, quicklook, send};

/// Overlay state for modal dialogs
#[derive(Debug)]
pub enum Overlay {
    /// No overlay active
    None,
    /// Help screen showing keybindings
    Help,
    /// Quicklook for entity details
    Quicklook(quicklook::QuicklookState),
    /// Fuzzy finder for orchestrations
    FuzzyFinder(fuzzy::FuzzyState),
    /// Send command dialog
    SendDialog(send::SendDialogState),
}

/// App represents the minimal app shell
pub struct App {
    grid: PanelGrid,
    should_quit: bool,
    pub dashboard: Dashboard,
    pub data_source: Option<DataSource>,
    pub current_feature: Option<String>,
    pub overlay: Overlay,
    /// Status message to display (clears on next key)
    pub status_message: Option<String>,
}

impl App {
    /// Create a new App instance
    pub fn new() -> Self {
        Self {
            grid: PanelGrid::new(),
            should_quit: false,
            dashboard: Dashboard::new(),
            data_source: None,
            current_feature: None,
            overlay: Overlay::None,
            status_message: None,
        }
    }

    /// Create a new App instance with optional fixture path for data source
    pub fn with_fixture_path(fixture_path: Option<PathBuf>) -> Self {
        let data_source = fixture_path.map(|p| DataSource::new(Some(p)));
        Self {
            grid: PanelGrid::new(),
            should_quit: false,
            dashboard: Dashboard::new(),
            data_source,
            current_feature: None,
            overlay: Overlay::None,
            status_message: None,
        }
    }

    /// Handle a key event
    pub fn handle_key(&mut self, key: KeyEvent) {
        // Clear status message on any key
        self.status_message = None;

        // Handle overlay keys first (overlay captures all input)
        match &mut self.overlay {
            Overlay::None => {}
            Overlay::Help => {
                if help::handle_key(key) {
                    self.overlay = Overlay::None;
                }
                return;
            }
            Overlay::Quicklook(state) => {
                match quicklook::handle_key(state, key) {
                    quicklook::QuicklookResult::Close => self.overlay = Overlay::None,
                    quicklook::QuicklookResult::Action(action) => {
                        self.overlay = Overlay::None;
                        if let Ok(Some(msg)) = actions::execute(action) {
                            self.status_message = Some(msg);
                        }
                    }
                    quicklook::QuicklookResult::Consumed => {}
                }
                return;
            }
            Overlay::FuzzyFinder(state) => {
                match fuzzy::handle_key(state, key) {
                    fuzzy::FuzzyResult::Close => self.overlay = Overlay::None,
                    fuzzy::FuzzyResult::Select(feature) => {
                        self.overlay = Overlay::None;
                        if let Err(e) = self.load_orchestration(&feature) {
                            self.status_message = Some(format!("Error: {}", e));
                        }
                    }
                    fuzzy::FuzzyResult::Consumed => {}
                }
                return;
            }
            Overlay::SendDialog(state) => {
                match send::handle_key(state, key) {
                    send::SendResult::Cancel => self.overlay = Overlay::None,
                    send::SendResult::Send(pane_id, cmd) => {
                        self.overlay = Overlay::None;
                        let action = crate::entity::EntityAction::SendCommand {
                            pane_id,
                            command: cmd,
                        };
                        if let Ok(Some(msg)) = actions::execute(action) {
                            self.status_message = Some(msg);
                        }
                    }
                    send::SendResult::Consumed => {}
                }
                return;
            }
        }

        // Global keys (when no overlay)
        match key.code {
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Esc => self.should_quit = true,
            KeyCode::Char('?') => self.overlay = Overlay::Help,
            KeyCode::Char('/') => {
                // Open fuzzy finder with available orchestrations
                let items = self.list_orchestrations();
                self.overlay = Overlay::FuzzyFinder(fuzzy::FuzzyState::new(items));
            }
            KeyCode::Char(' ') => {
                // Quicklook for selected entity
                if let Some(entity) = self.grid.selected_entity() {
                    self.overlay = Overlay::Quicklook(quicklook::QuicklookState::new(entity));
                }
            }
            _ => {
                // Non-global keys delegated to grid
                self.grid.handle_key(key);
            }
        }
    }

    /// List available orchestrations for fuzzy finder
    fn list_orchestrations(&self) -> Vec<crate::types::OrchestrationSummary> {
        if let Some(ds) = &self.data_source {
            ds.list_orchestrations().unwrap_or_default()
        } else {
            vec![]
        }
    }

    /// Render the app to the frame
    ///
    /// Layout: 2 rows for dashboard header, rest for panel grid
    pub fn render(&self, frame: &mut Frame) {
        use ratatui::layout::{Constraint, Direction, Layout};

        let area = frame.area();

        // Split: 2 rows for dashboard, rest for grid
        let [dashboard_area, grid_area] = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(2), Constraint::Min(0)])
            .areas(area);

        // Render dashboard header with optional status message
        self.dashboard.render_with_status(
            frame,
            dashboard_area,
            self.status_message.as_deref(),
        );

        // Render panel grid
        self.grid.render(frame, grid_area);

        // Render overlay on top (if active)
        match &self.overlay {
            Overlay::None => {}
            Overlay::Help => help::render(frame),
            Overlay::Quicklook(state) => quicklook::render(state, frame),
            Overlay::FuzzyFinder(state) => fuzzy::render(state, frame),
            Overlay::SendDialog(state) => send::render(state, frame),
        }
    }

    /// Check if app should quit
    pub fn should_quit(&self) -> bool {
        self.should_quit
    }

    /// Get the current panel focus position
    pub fn get_panel_focus(&self) -> (usize, usize) {
        self.grid.focus()
    }

    /// Load orchestration data for a feature
    ///
    /// Updates dashboard, team panels, tasks panel, and commits panel.
    pub fn load_orchestration(&mut self, feature: &str) -> Result<()> {
        let data_source = self.data_source.as_mut()
            .ok_or_else(|| anyhow!("No data source configured"))?;

        // Clone the orchestration data to avoid borrow issues
        let orchestration = data_source.load_orchestration(feature)?.clone();

        // Update dashboard with supervisor state
        self.dashboard.update(&orchestration.state);

        // Update orchestrator team panel
        if let Some(team) = &orchestration.orchestrator_team {
            // Team members are already TeamMember type
            self.grid.set_orchestrator_team(team.members.clone());
        }

        // Update phase team panel
        if let Some(team) = &orchestration.phase_team {
            // Team members are already TeamMember type
            self.grid.set_phase_team(team.members.clone());
        }

        // Update tasks panel
        self.grid.set_tasks(orchestration.tasks.clone());

        // Load phase commits
        self.load_phase_commits(&orchestration)?;

        self.current_feature = Some(feature.to_string());

        Ok(())
    }

    /// Load commits for the current phase
    fn load_phase_commits(&mut self, orchestration: &LoadedOrchestration) -> Result<()> {
        let phase_key = orchestration.state.current_phase.to_string();

        // Get git range from current phase, falling back to "main..HEAD"
        let git_range = orchestration.state.phases
            .get(&phase_key)
            .and_then(|phase| phase.git_range.clone())
            .unwrap_or_else(|| "main..HEAD".to_string());

        let worktree_path = &orchestration.state.worktree_path;

        // Gracefully handle errors - commits panel can be empty
        match get_commits(worktree_path, &git_range) {
            Ok(summary) => {
                self.grid.set_commits(summary.commits, summary.insertions, summary.deletions);
            }
            Err(_) => {
                // Gracefully handle - just show empty commits
                self.grid.set_commits(vec![], 0, 0);
            }
        }

        Ok(())
    }

    /// Refresh data for the current feature
    pub fn refresh(&mut self) -> Result<()> {
        let feature = self.current_feature.clone()
            .ok_or_else(|| anyhow!("No feature currently loaded"))?;

        self.load_orchestration(&feature)
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

    // ====================================================================
    // DataSource Integration Tests
    // ====================================================================

    #[test]
    fn new_app_with_fixture_path_creates_data_source() {
        use std::path::PathBuf;

        let fixture_path = PathBuf::from("/some/fixture/path");
        let app = App::with_fixture_path(Some(fixture_path.clone()));

        // App should have a data source configured
        assert!(app.data_source.is_some());
    }

    #[test]
    fn new_app_without_fixture_path_has_no_data_source() {
        let app = App::with_fixture_path(None);
        assert!(app.data_source.is_none());
    }

    #[test]
    fn app_has_dashboard_field() {
        let app = App::new();
        // Dashboard should exist and have default values
        assert_eq!(app.dashboard.feature, "");
    }

    #[test]
    fn app_has_current_feature_field() {
        let app = App::new();
        assert!(app.current_feature.is_none());
    }

    // ====================================================================
    // load_orchestration Tests
    // ====================================================================

    #[test]
    fn load_orchestration_returns_error_without_data_source() {
        let mut app = App::new();
        let result = app.load_orchestration("test-feature");
        assert!(result.is_err());
    }

    #[test]
    fn load_orchestration_sets_current_feature() {
        use std::fs;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let fixture_path = temp_dir.path().to_path_buf();

        // Create fixture: {fixture}/test-feature/.claude/tina/supervisor-state.json
        let tina_dir = fixture_path.join("test-feature").join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();

        let state_json = r#"{
            "version":1,"feature":"test-feature","spec_doc":"docs/design.md",
            "worktree_path":"test-feature","branch":"tina/test-feature","total_phases":3,
            "current_phase":2,"status":"executing","orchestration_started_at":"2026-01-30T10:00:00Z",
            "phases":{}
        }"#;
        fs::write(tina_dir.join("supervisor-state.json"), state_json).unwrap();

        let mut app = App::with_fixture_path(Some(fixture_path));
        let result = app.load_orchestration("test-feature");
        assert!(result.is_ok());
        assert_eq!(app.current_feature, Some("test-feature".to_string()));
    }

    #[test]
    fn load_orchestration_updates_dashboard() {
        use std::fs;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let fixture_path = temp_dir.path().to_path_buf();

        let tina_dir = fixture_path.join("test-feature").join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();

        let state_json = r#"{
            "version":1,"feature":"test-feature","spec_doc":"docs/design.md",
            "worktree_path":"test-feature","branch":"tina/test-feature","total_phases":3,
            "current_phase":2,"status":"executing","orchestration_started_at":"2026-01-30T10:00:00Z",
            "phases":{}
        }"#;
        fs::write(tina_dir.join("supervisor-state.json"), state_json).unwrap();

        let mut app = App::with_fixture_path(Some(fixture_path));
        app.load_orchestration("test-feature").unwrap();

        assert_eq!(app.dashboard.feature, "test-feature");
        assert_eq!(app.dashboard.current_phase, 2);
        assert_eq!(app.dashboard.total_phases, 3);
    }

    // ====================================================================
    // refresh Tests
    // ====================================================================

    #[test]
    fn refresh_returns_error_when_no_current_feature() {
        let mut app = App::new();
        let result = app.refresh();
        assert!(result.is_err());
    }

    #[test]
    fn refresh_reloads_current_feature() {
        use std::fs;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let fixture_path = temp_dir.path().to_path_buf();

        let tina_dir = fixture_path.join("test-feature").join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();

        let state_json = r#"{
            "version":1,"feature":"test-feature","spec_doc":"docs/design.md",
            "worktree_path":"test-feature","branch":"tina/test-feature","total_phases":3,
            "current_phase":2,"status":"executing","orchestration_started_at":"2026-01-30T10:00:00Z",
            "phases":{}
        }"#;
        fs::write(tina_dir.join("supervisor-state.json"), state_json).unwrap();

        let mut app = App::with_fixture_path(Some(fixture_path.clone()));
        app.load_orchestration("test-feature").unwrap();

        // Update the state file
        let updated_state_json = r#"{
            "version":1,"feature":"test-feature","spec_doc":"docs/design.md",
            "worktree_path":"test-feature","branch":"tina/test-feature","total_phases":3,
            "current_phase":3,"status":"reviewing","orchestration_started_at":"2026-01-30T10:00:00Z",
            "phases":{}
        }"#;
        fs::write(tina_dir.join("supervisor-state.json"), updated_state_json).unwrap();

        let result = app.refresh();
        assert!(result.is_ok());
        assert_eq!(app.dashboard.current_phase, 3);
    }

    // ====================================================================
    // Render Tests
    // ====================================================================

    #[test]
    fn render_does_not_panic() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let app = App::new();
        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            app.render(frame);
        });

        assert!(result.is_ok());
    }

    #[test]
    fn render_with_status_message_does_not_panic() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;

        let mut app = App::new();
        app.status_message = Some("Copied: abc1234".to_string());

        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            app.render(frame);
        });

        assert!(result.is_ok());
    }

    #[test]
    fn status_message_clears_on_key_press() {
        let mut app = App::new();
        app.status_message = Some("Test message".to_string());

        // Any key should clear the message
        app.handle_key(make_key(KeyCode::Right));

        assert!(app.status_message.is_none());
    }

    #[test]
    fn render_with_loaded_feature_does_not_panic() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;
        use std::fs;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let fixture_path = temp_dir.path().to_path_buf();

        let tina_dir = fixture_path.join("test-feature").join(".claude").join("tina");
        fs::create_dir_all(&tina_dir).unwrap();

        let state_json = r#"{
            "version":1,"feature":"test-feature","spec_doc":"docs/design.md",
            "worktree_path":"test-feature","branch":"tina/test-feature","total_phases":3,
            "current_phase":2,"status":"executing","orchestration_started_at":"2026-01-30T10:00:00Z",
            "phases":{}
        }"#;
        fs::write(tina_dir.join("supervisor-state.json"), state_json).unwrap();

        let mut app = App::with_fixture_path(Some(fixture_path));
        app.load_orchestration("test-feature").unwrap();

        let backend = TestBackend::new(120, 40);
        let mut terminal = Terminal::new(backend).unwrap();

        let result = terminal.draw(|frame| {
            app.render(frame);
        });

        assert!(result.is_ok());
    }
}
