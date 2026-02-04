use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::Frame;

use crate::entity::Entity;
use crate::git::commits::Commit;
use crate::panel::{Direction, HandleResult, Panel};
use crate::panels::{CommitsPanel, TasksPanel, TeamPanel};
use crate::types::{Task, TeamMember};

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
    /// Top-left: orchestrator team
    orchestrator_panel: TeamPanel,
    /// Top-right: tasks
    tasks_panel: TasksPanel,
    /// Bottom-left: phase team
    phase_panel: TeamPanel,
    /// Bottom-right: commits
    commits_panel: CommitsPanel,
    /// Current focus position: (row, col)
    focus: (usize, usize),
}

impl PanelGrid {
    /// Create a new PanelGrid with default panels
    pub fn new() -> Self {
        Self {
            orchestrator_panel: TeamPanel::new(),
            tasks_panel: TasksPanel::new(),
            phase_panel: TeamPanel::new(),
            commits_panel: CommitsPanel::new(),
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

    /// Set orchestrator team data (top-left panel)
    pub fn set_orchestrator_team(&mut self, members: Vec<TeamMember>) {
        self.orchestrator_panel.set_members(members);
    }

    /// Set phase team data (bottom-left panel)
    pub fn set_phase_team(&mut self, members: Vec<TeamMember>) {
        self.phase_panel.set_members(members);
    }

    /// Set tasks data (top-right panel)
    pub fn set_tasks(&mut self, tasks: Vec<Task>) {
        self.tasks_panel.set_tasks(tasks);
    }

    /// Set commits data (bottom-right panel)
    pub fn set_commits(&mut self, commits: Vec<Commit>, insertions: usize, deletions: usize) {
        self.commits_panel.set_commits(commits, insertions, deletions);
    }

    /// Get the selected orchestrator team member
    pub fn get_orchestrator_team_member(&self) -> Option<&TeamMember> {
        self.orchestrator_panel.selected_member()
    }

    /// Get the selected phase team member
    pub fn get_phase_team_member(&self) -> Option<&TeamMember> {
        self.phase_panel.selected_member()
    }

    /// Get the selected task
    pub fn get_selected_task(&self) -> Option<&Task> {
        self.tasks_panel.selected_task()
    }

    /// Get the selected commit
    pub fn get_selected_commit(&self) -> Option<&Commit> {
        self.commits_panel.selected_commit()
    }

    /// Get the entity from the currently focused panel
    pub fn selected_entity(&self) -> Option<Entity> {
        let (row, col) = self.focus;
        match (row, col) {
            (0, 0) => self
                .orchestrator_panel
                .selected_member()
                .map(|m| Entity::TeamMember(m.clone())),
            (0, 1) => self
                .tasks_panel
                .selected_task()
                .map(|t| Entity::Task(t.clone())),
            (1, 0) => self
                .phase_panel
                .selected_member()
                .map(|m| Entity::TeamMember(m.clone())),
            (1, 1) => self
                .commits_panel
                .selected_commit()
                .map(|c| Entity::Commit(c.clone())),
            _ => None,
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
        let result = match (row, col) {
            (0, 0) => self.orchestrator_panel.handle_key(key),
            (0, 1) => self.tasks_panel.handle_key(key),
            (1, 0) => self.phase_panel.handle_key(key),
            (1, 1) => self.commits_panel.handle_key(key),
            _ => HandleResult::Ignored,
        };

        // Handle the panel's result
        match result {
            HandleResult::Consumed => GridResult::Consumed,
            HandleResult::Ignored => GridResult::Ignored,
            HandleResult::MoveFocus(dir) => {
                self.move_focus(dir);
                GridResult::Consumed
            }
            HandleResult::Quicklook(_) => {
                // Quicklook is handled by App via overlay system
                GridResult::Consumed
            }
            HandleResult::EntityAction(_) => {
                // Entity actions are handled by App via actions module
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

        self.orchestrator_panel.render(frame, top_left, is_focused_00);
        self.tasks_panel.render(frame, top_right, is_focused_01);
        self.phase_panel.render(frame, bottom_left, is_focused_10);
        self.commits_panel.render(frame, bottom_right, is_focused_11);
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
    use crossterm::event::{KeyCode, KeyModifiers};

    fn make_key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    // ====================================================================
    // Enum Tests
    // ====================================================================

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

    // ====================================================================
    // Focus Wrapping Tests (Right/Left)
    // ====================================================================

    #[test]
    fn right_arrow_wraps_from_col_1_to_col_0() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 1));

        grid.move_focus(Direction::Right);

        assert_eq!(
            grid.focus(),
            (0, 0),
            "Right at col 1 should wrap to col 0"
        );
    }

    #[test]
    fn right_arrow_moves_from_col_0_to_col_1() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        grid.move_focus(Direction::Right);

        assert_eq!(
            grid.focus(),
            (0, 1),
            "Right at col 0 should move to col 1"
        );
    }

    #[test]
    fn left_arrow_wraps_from_col_0_to_col_1() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        grid.move_focus(Direction::Left);

        assert_eq!(
            grid.focus(),
            (0, 1),
            "Left at col 0 should wrap to col 1"
        );
    }

    #[test]
    fn left_arrow_moves_from_col_1_to_col_0() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 1));

        grid.move_focus(Direction::Left);

        assert_eq!(
            grid.focus(),
            (0, 0),
            "Left at col 1 should move to col 0"
        );
    }

    // ====================================================================
    // Focus Wrapping Tests (Up/Down)
    // ====================================================================

    #[test]
    fn down_arrow_wraps_from_row_1_to_row_0() {
        let mut grid = PanelGrid::new();
        grid.set_focus((1, 0));

        grid.move_focus(Direction::Down);

        assert_eq!(
            grid.focus(),
            (0, 0),
            "Down at row 1 should wrap to row 0"
        );
    }

    #[test]
    fn down_arrow_moves_from_row_0_to_row_1() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        grid.move_focus(Direction::Down);

        assert_eq!(
            grid.focus(),
            (1, 0),
            "Down at row 0 should move to row 1"
        );
    }

    #[test]
    fn up_arrow_wraps_from_row_0_to_row_1() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        grid.move_focus(Direction::Up);

        assert_eq!(
            grid.focus(),
            (1, 0),
            "Up at row 0 should wrap to row 1"
        );
    }

    #[test]
    fn up_arrow_moves_from_row_1_to_row_0() {
        let mut grid = PanelGrid::new();
        grid.set_focus((1, 0));

        grid.move_focus(Direction::Up);

        assert_eq!(
            grid.focus(),
            (0, 0),
            "Up at row 1 should move to row 0"
        );
    }

    // ====================================================================
    // Key Event Tests (Arrow Keys)
    // ====================================================================

    #[test]
    fn right_key_event_wraps_focus() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 1));

        let result = grid.handle_key(make_key(KeyCode::Right));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(grid.focus(), (0, 0));
    }

    #[test]
    fn left_key_event_wraps_focus() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        let result = grid.handle_key(make_key(KeyCode::Left));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(grid.focus(), (0, 1));
    }

    #[test]
    fn down_key_event_wraps_focus() {
        let mut grid = PanelGrid::new();
        grid.set_focus((1, 0));

        let result = grid.handle_key(make_key(KeyCode::Down));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(grid.focus(), (0, 0));
    }

    #[test]
    fn up_key_event_wraps_focus() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        let result = grid.handle_key(make_key(KeyCode::Up));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(grid.focus(), (1, 0));
    }

    // ====================================================================
    // Key Event Tests (Vim Keys)
    // ====================================================================

    #[test]
    fn l_key_moves_right() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        let result = grid.handle_key(make_key(KeyCode::Char('l')));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(grid.focus(), (0, 1));
    }

    #[test]
    fn h_key_moves_left() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 1));

        let result = grid.handle_key(make_key(KeyCode::Char('h')));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(grid.focus(), (0, 0));
    }

    #[test]
    fn j_key_moves_down() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        let result = grid.handle_key(make_key(KeyCode::Char('j')));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(grid.focus(), (1, 0));
    }

    #[test]
    fn k_key_moves_up() {
        let mut grid = PanelGrid::new();
        grid.set_focus((1, 0));

        let result = grid.handle_key(make_key(KeyCode::Char('k')));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(grid.focus(), (0, 0));
    }

    // ====================================================================
    // Key Delegation Tests (unrecognized keys go to panel)
    // ====================================================================

    #[test]
    fn unknown_key_delegated_to_focused_panel() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        // Send an unknown key like F(1)
        let result = grid.handle_key(make_key(KeyCode::F(1)));

        // The panel may consume or ignore it, but grid should not error
        assert!(
            matches!(result, GridResult::Consumed | GridResult::Ignored),
            "Unknown key should be handled by panel"
        );
    }

    #[test]
    fn char_key_not_hjkl_delegated_to_panel() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        // Send 'a' which is not a grid navigation key
        let result = grid.handle_key(make_key(KeyCode::Char('a')));

        // Should be delegated to panel
        assert!(
            matches!(result, GridResult::Consumed | GridResult::Ignored),
            "Non-navigation keys should go to panel"
        );
    }

    // ====================================================================
    // Panel-Initiated Focus Movement Tests
    // ====================================================================

    #[test]
    fn panel_move_focus_right_request_honored() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        // Simulate panel requesting right movement
        let result = grid.handle_key(make_key(KeyCode::Char('l')));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(
            grid.focus(),
            (0, 1),
            "Grid should honor move_focus(Right) request"
        );
    }

    #[test]
    fn panel_move_focus_left_request_honored() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 1));

        // Simulate panel requesting left movement
        let result = grid.handle_key(make_key(KeyCode::Char('h')));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(
            grid.focus(),
            (0, 0),
            "Grid should honor move_focus(Left) request"
        );
    }

    #[test]
    fn panel_move_focus_down_request_honored() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        // Simulate panel requesting down movement
        let result = grid.handle_key(make_key(KeyCode::Char('j')));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(
            grid.focus(),
            (1, 0),
            "Grid should honor move_focus(Down) request"
        );
    }

    #[test]
    fn panel_move_focus_up_request_honored() {
        let mut grid = PanelGrid::new();
        grid.set_focus((1, 0));

        // Simulate panel requesting up movement
        let result = grid.handle_key(make_key(KeyCode::Char('k')));

        assert_eq!(result, GridResult::Consumed);
        assert_eq!(
            grid.focus(),
            (0, 0),
            "Grid should honor move_focus(Up) request"
        );
    }

    // ====================================================================
    // Focus Position Tests
    // ====================================================================

    #[test]
    fn initial_focus_is_top_left() {
        let grid = PanelGrid::new();
        assert_eq!(grid.focus(), (0, 0));
    }

    #[test]
    fn set_focus_changes_position() {
        let mut grid = PanelGrid::new();
        grid.set_focus((1, 1));
        assert_eq!(grid.focus(), (1, 1));
    }

    #[test]
    fn set_focus_to_all_positions() {
        let mut grid = PanelGrid::new();
        let positions = [(0, 0), (0, 1), (1, 0), (1, 1)];

        for pos in positions {
            grid.set_focus(pos);
            assert_eq!(
                grid.focus(),
                pos,
                "Should be able to set focus to {:?}",
                pos
            );
        }
    }

    // ====================================================================
    // Edge Case Tests
    // ====================================================================

    #[test]
    fn multiple_sequential_right_movements() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        // Right twice should cycle: 0 -> 1 -> 0
        grid.move_focus(Direction::Right);
        assert_eq!(grid.focus(), (0, 1));
        grid.move_focus(Direction::Right);
        assert_eq!(grid.focus(), (0, 0));
    }

    #[test]
    fn multiple_sequential_down_movements() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        // Down twice should cycle: 0 -> 1 -> 0
        grid.move_focus(Direction::Down);
        assert_eq!(grid.focus(), (1, 0));
        grid.move_focus(Direction::Down);
        assert_eq!(grid.focus(), (0, 0));
    }

    #[test]
    fn complete_clockwise_navigation() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        // Move: right -> down -> left -> up -> back to (0,0)
        grid.move_focus(Direction::Right);
        assert_eq!(grid.focus(), (0, 1), "After right");

        grid.move_focus(Direction::Down);
        assert_eq!(grid.focus(), (1, 1), "After down");

        grid.move_focus(Direction::Left);
        assert_eq!(grid.focus(), (1, 0), "After left");

        grid.move_focus(Direction::Up);
        assert_eq!(grid.focus(), (0, 0), "After up");
    }

    #[test]
    fn complete_counter_clockwise_navigation() {
        let mut grid = PanelGrid::new();
        grid.set_focus((0, 0));

        // Move: down -> right -> up -> left -> back to (0,0)
        grid.move_focus(Direction::Down);
        assert_eq!(grid.focus(), (1, 0), "After down");

        grid.move_focus(Direction::Right);
        assert_eq!(grid.focus(), (1, 1), "After right");

        grid.move_focus(Direction::Up);
        assert_eq!(grid.focus(), (0, 1), "After up");

        grid.move_focus(Direction::Left);
        assert_eq!(grid.focus(), (0, 0), "After left");
    }

    // ====================================================================
    // Data Setter Tests (failing tests for TDD)
    // ====================================================================

    #[test]
    fn set_orchestrator_team_updates_top_left_panel() {
        use crate::types::TeamMember;
        use std::path::PathBuf;

        let mut grid = PanelGrid::new();
        let members = vec![TeamMember {
            agent_id: "agent-1".to_string(),
            name: "test-member".to_string(),
            agent_type: Some("test".to_string()),
            model: "claude-haiku".to_string(),
            joined_at: 0,
            tmux_pane_id: None,
            cwd: PathBuf::from("/test"),
            subscriptions: vec![],
        }];

        grid.set_orchestrator_team(members.clone());

        // Verify the team panel was updated
        let selected_member = grid.get_orchestrator_team_member();
        assert!(selected_member.is_some());
        assert_eq!(selected_member.unwrap().name, "test-member");
    }

    #[test]
    fn set_phase_team_updates_bottom_left_panel() {
        use crate::types::TeamMember;
        use std::path::PathBuf;

        let mut grid = PanelGrid::new();
        let members = vec![TeamMember {
            agent_id: "agent-2".to_string(),
            name: "phase-member".to_string(),
            agent_type: Some("test".to_string()),
            model: "claude-haiku".to_string(),
            joined_at: 0,
            tmux_pane_id: None,
            cwd: PathBuf::from("/test"),
            subscriptions: vec![],
        }];

        grid.set_phase_team(members.clone());

        let selected_member = grid.get_phase_team_member();
        assert!(selected_member.is_some());
        assert_eq!(selected_member.unwrap().name, "phase-member");
    }

    #[test]
    fn set_tasks_updates_top_right_panel() {
        use crate::types::Task;

        let mut grid = PanelGrid::new();
        let tasks = vec![Task {
            id: "task-1".to_string(),
            subject: "Test Task".to_string(),
            description: "Test description".to_string(),
            active_form: None,
            status: crate::types::TaskStatus::Pending,
            owner: None,
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        }];

        grid.set_tasks(tasks);

        let task = grid.get_selected_task();
        assert!(task.is_some());
        assert_eq!(task.unwrap().id, "task-1");
    }

    #[test]
    fn set_commits_updates_bottom_right_panel() {
        use crate::git::commits::Commit;

        let mut grid = PanelGrid::new();
        let commits = vec![Commit {
            short_hash: "abc1234".to_string(),
            hash: "abc12340000000000000000000000000000".to_string(),
            subject: "Test commit".to_string(),
            author: "Test Author".to_string(),
            relative_time: "2 hours ago".to_string(),
        }];

        grid.set_commits(commits, 50, 10);

        let commit = grid.get_selected_commit();
        assert!(commit.is_some());
        assert_eq!(commit.unwrap().short_hash, "abc1234");
    }

    #[test]
    fn multiple_data_updates_persist_independently() {
        use crate::types::TeamMember;
        use crate::types::Task;
        use crate::git::commits::Commit;
        use std::path::PathBuf;

        let mut grid = PanelGrid::new();

        // Set orchestrator team
        let orchestrator_members = vec![TeamMember {
            agent_id: "orch-1".to_string(),
            name: "orchestrator".to_string(),
            agent_type: Some("lead".to_string()),
            model: "claude-opus".to_string(),
            joined_at: 0,
            tmux_pane_id: Some("pane-1".to_string()),
            cwd: PathBuf::from("/work"),
            subscriptions: vec![],
        }];
        grid.set_orchestrator_team(orchestrator_members);

        // Set phase team
        let phase_members = vec![TeamMember {
            agent_id: "phase-1".to_string(),
            name: "phase-worker".to_string(),
            agent_type: Some("worker".to_string()),
            model: "claude-sonnet".to_string(),
            joined_at: 0,
            tmux_pane_id: None,
            cwd: PathBuf::from("/work"),
            subscriptions: vec![],
        }];
        grid.set_phase_team(phase_members);

        // Set tasks
        let tasks = vec![Task {
            id: "t1".to_string(),
            subject: "Task 1".to_string(),
            description: "Desc".to_string(),
            active_form: None,
            status: crate::types::TaskStatus::Pending,
            owner: None,
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        }];
        grid.set_tasks(tasks);

        // Set commits
        let commits = vec![Commit {
            short_hash: "def5678".to_string(),
            hash: "def56780000000000000000000000000000".to_string(),
            subject: "Commit msg".to_string(),
            author: "Author".to_string(),
            relative_time: "1 hour ago".to_string(),
        }];
        grid.set_commits(commits, 100, 20);

        // Verify all data persists
        assert_eq!(
            grid.get_orchestrator_team_member().unwrap().name,
            "orchestrator"
        );
        assert_eq!(
            grid.get_phase_team_member().unwrap().name,
            "phase-worker"
        );
        assert_eq!(grid.get_selected_task().unwrap().id, "t1");
        assert_eq!(grid.get_selected_commit().unwrap().short_hash, "def5678");
    }
}
