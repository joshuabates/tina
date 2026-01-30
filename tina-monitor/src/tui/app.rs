//! TUI application state and event loop

use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use ratatui::{backend::Backend, Terminal};
use std::time::{Duration, Instant};

use super::ui;
use crate::data::discovery::{find_orchestrations, Orchestration};
use crate::data::watcher::{FileWatcher, WatchEvent};

/// Result type for TUI operations
pub type AppResult<T> = Result<T, Box<dyn std::error::Error>>;

/// Which view/modal is currently active
#[derive(Debug, Clone, PartialEq)]
pub enum ViewState {
    /// Main orchestration list view
    OrchestrationList,
    /// Phase detail view
    PhaseDetail {
        /// Which pane has focus
        focus: PaneFocus,
        /// Selected task index
        task_index: usize,
        /// Selected member index
        member_index: usize,
    },
    /// Task inspector modal
    TaskInspector {
        /// Selected task index
        task_index: usize,
    },
    /// Log viewer modal
    LogViewer {
        /// Selected agent index
        agent_index: usize,
        /// Scroll offset
        scroll_offset: usize,
    },
}

/// Which pane has focus in PhaseDetail view
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PaneFocus {
    /// Tasks pane
    Tasks,
    /// Members pane
    Members,
}

/// Main TUI application state
pub struct App {
    /// Whether the application should quit
    pub should_quit: bool,
    /// List of discovered orchestrations
    pub orchestrations: Vec<Orchestration>,
    /// Index of the currently selected orchestration
    pub selected_index: usize,
    /// Tick rate for event polling
    pub tick_rate: Duration,
    /// Whether to show the help modal
    pub show_help: bool,
    /// File watcher for automatic refresh
    pub(crate) watcher: Option<FileWatcher>,
    /// Time of last refresh (for debouncing)
    pub(crate) last_refresh: Instant,
    /// Current view state
    pub view_state: ViewState,
}

impl App {
    /// Create a new App instance
    pub fn new() -> AppResult<Self> {
        let orchestrations = find_orchestrations()?;
        let watcher = FileWatcher::new().ok(); // Don't fail if watcher can't start

        Ok(Self {
            should_quit: false,
            orchestrations,
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        })
    }

    /// Create a new App instance for testing with provided orchestrations
    ///
    /// This is primarily intended for testing purposes.
    #[doc(hidden)]
    pub fn new_with_orchestrations(orchestrations: Vec<Orchestration>) -> Self {
        Self {
            should_quit: false,
            orchestrations,
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        }
    }

    /// Move selection to next orchestration (wraps around)
    pub fn next(&mut self) {
        if self.orchestrations.is_empty() {
            return;
        }
        self.selected_index = (self.selected_index + 1) % self.orchestrations.len();
    }

    /// Move selection to previous orchestration (wraps around)
    pub fn previous(&mut self) {
        if self.orchestrations.is_empty() {
            return;
        }
        if self.selected_index == 0 {
            self.selected_index = self.orchestrations.len() - 1;
        } else {
            self.selected_index -= 1;
        }
    }

    /// Refresh orchestrations list from disk
    pub fn refresh(&mut self) -> AppResult<()> {
        self.orchestrations = find_orchestrations()?;
        // Clamp selected_index to valid range
        if self.orchestrations.is_empty() {
            self.selected_index = 0;
        } else if self.selected_index >= self.orchestrations.len() {
            self.selected_index = self.orchestrations.len() - 1;
        }
        Ok(())
    }

    /// Check for file watcher events and refresh if needed
    fn check_watcher(&mut self) {
        // Collect events first to avoid borrow conflict
        let mut should_refresh = false;

        if let Some(ref watcher) = self.watcher {
            while let Some(event) = watcher.try_recv() {
                match event {
                    WatchEvent::Refresh => {
                        // Debounce: only refresh if 500ms since last refresh
                        if self.last_refresh.elapsed() > Duration::from_millis(500) {
                            should_refresh = true;
                        }
                    }
                    WatchEvent::Error(_e) => {
                        // Ignore errors, just continue
                    }
                }
            }
        }

        if should_refresh {
            let _ = self.refresh();
            self.last_refresh = Instant::now();
        }
    }

    /// Handle a key event
    fn handle_key_event(&mut self, key: KeyEvent) {
        // Global keys work in all views
        match key.code {
            KeyCode::Char('?') => {
                self.show_help = !self.show_help;
                return;
            }
            KeyCode::Char('q') => {
                self.should_quit = true;
                return;
            }
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.should_quit = true;
                return;
            }
            _ => {}
        }

        // Handle Esc key - behavior depends on current view and help state
        if key.code == KeyCode::Esc {
            if self.show_help {
                // Close help modal
                self.show_help = false;
                return;
            }
            // Let view-specific handlers handle Esc for navigation
            // Only quit from OrchestrationList view
        }

        // Dispatch to view-specific handler
        match &self.view_state {
            ViewState::OrchestrationList => self.handle_orchestration_list_key(key),
            ViewState::PhaseDetail { .. } => self.handle_phase_detail_key(key),
            ViewState::TaskInspector { .. } => self.handle_task_inspector_key(key),
            ViewState::LogViewer { .. } => self.handle_log_viewer_key(key),
        }
    }

    /// Handle key events in OrchestrationList view
    fn handle_orchestration_list_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.should_quit = true;
            }
            KeyCode::Char('j') | KeyCode::Down => self.next(),
            KeyCode::Char('k') | KeyCode::Up => self.previous(),
            KeyCode::Char('r') => {
                let _ = self.refresh();
            }
            KeyCode::Enter => {
                if !self.orchestrations.is_empty() {
                    self.view_state = ViewState::PhaseDetail {
                        focus: PaneFocus::Tasks,
                        task_index: 0,
                        member_index: 0,
                    };
                }
            }
            _ => {}
        }
    }

    /// Handle key events in PhaseDetail view
    fn handle_phase_detail_key(&mut self, key: KeyEvent) {
        // Extract current state - we need to destructure to modify
        let (focus, task_index, member_index) = match self.view_state {
            ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
            } => (focus, task_index, member_index),
            _ => return, // Should never happen, but guard against it
        };

        // Handle global PhaseDetail keys first
        match key.code {
            KeyCode::Esc => {
                self.view_state = ViewState::OrchestrationList;
                return;
            }
            KeyCode::Char('r') => {
                let _ = self.refresh();
                return;
            }
            KeyCode::Char('t') | KeyCode::Left => {
                self.view_state = ViewState::PhaseDetail {
                    focus: PaneFocus::Tasks,
                    task_index,
                    member_index,
                };
                return;
            }
            KeyCode::Char('m') | KeyCode::Right => {
                self.view_state = ViewState::PhaseDetail {
                    focus: PaneFocus::Members,
                    task_index,
                    member_index,
                };
                return;
            }
            _ => {}
        }

        // Handle focus-specific navigation and actions
        match focus {
            PaneFocus::Tasks => {
                // Get task count - hardcoded to 3 for now (will be dynamic later)
                const TASK_COUNT: usize = 3;

                match key.code {
                    KeyCode::Char('j') | KeyCode::Down => {
                        let new_index = (task_index + 1) % TASK_COUNT;
                        self.view_state = ViewState::PhaseDetail {
                            focus,
                            task_index: new_index,
                            member_index,
                        };
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        let new_index = if task_index == 0 {
                            TASK_COUNT - 1
                        } else {
                            task_index - 1
                        };
                        self.view_state = ViewState::PhaseDetail {
                            focus,
                            task_index: new_index,
                            member_index,
                        };
                    }
                    KeyCode::Enter => {
                        self.view_state = ViewState::TaskInspector { task_index };
                    }
                    _ => {}
                }
            }
            PaneFocus::Members => {
                match key.code {
                    KeyCode::Char('j') | KeyCode::Down => {
                        self.view_state = ViewState::PhaseDetail {
                            focus,
                            task_index,
                            member_index: member_index + 1,
                        };
                    }
                    KeyCode::Char('k') | KeyCode::Up => {
                        self.view_state = ViewState::PhaseDetail {
                            focus,
                            task_index,
                            member_index: member_index.saturating_sub(1),
                        };
                    }
                    KeyCode::Char('l') => {
                        self.view_state = ViewState::LogViewer {
                            agent_index: member_index,
                            scroll_offset: 0,
                        };
                    }
                    _ => {}
                }
            }
        }
    }

    /// Handle key events in TaskInspector view
    fn handle_task_inspector_key(&mut self, key: KeyEvent) {
        if key.code == KeyCode::Esc {
            // Return to PhaseDetail view with previous state
            self.view_state = ViewState::PhaseDetail {
                focus: PaneFocus::Tasks,
                task_index: match &self.view_state {
                    ViewState::TaskInspector { task_index } => *task_index,
                    _ => 0,
                },
                member_index: 0,
            };
        }
    }

    /// Handle key events in LogViewer view (stub)
    fn handle_log_viewer_key(&mut self, _key: KeyEvent) {
        // TODO: Implement in Task 6
    }

    /// Run the application event loop
    pub fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> AppResult<()> {
        while !self.should_quit {
            terminal.draw(|frame| ui::render(frame, self))?;

            // Check for file watcher events
            self.check_watcher();

            self.handle_events()?;
        }
        Ok(())
    }

    /// Handle terminal events
    fn handle_events(&mut self) -> AppResult<()> {
        if event::poll(self.tick_rate)? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    self.handle_key_event(key);
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::discovery::OrchestrationStatus;
    use std::path::PathBuf;

    fn make_test_orchestration(title: &str) -> Orchestration {
        Orchestration {
            team_name: format!("{}-team", title),
            title: title.to_string(),
            cwd: PathBuf::from("/test"),
            current_phase: 1,
            total_phases: 3,
            design_doc_path: PathBuf::from("/test/design.md"),
            context_percent: Some(50),
            status: OrchestrationStatus::Idle,
            tasks: vec![],
        }
    }

    #[test]
    fn test_app_starts_in_orchestration_list_view() {
        let app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        assert!(matches!(app.view_state, ViewState::OrchestrationList));
    }

    #[test]
    fn test_global_question_mark_toggles_help_in_any_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

        // Start in OrchestrationList
        assert!(!app.show_help);

        let key = KeyEvent::new(KeyCode::Char('?'), KeyModifiers::NONE);
        app.handle_key_event(key.clone());
        assert!(app.show_help, "'?' should show help in OrchestrationList");

        app.handle_key_event(key);
        assert!(!app.show_help, "'?' should hide help in OrchestrationList");
    }

    #[test]
    fn test_global_q_quits_from_any_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

        assert!(!app.should_quit);

        let key = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(app.should_quit, "'q' should quit from OrchestrationList");
    }

    #[test]
    fn test_global_ctrl_c_quits_from_any_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);

        assert!(!app.should_quit);

        let key = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL);
        app.handle_key_event(key);
        assert!(app.should_quit, "Ctrl+C should quit from OrchestrationList");
    }

    #[test]
    fn test_esc_closes_help_without_changing_view() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.show_help = true;

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(!app.show_help, "Esc should close help");
        assert!(matches!(app.view_state, ViewState::OrchestrationList), "View should remain OrchestrationList");
        assert!(!app.should_quit, "Should not quit");
    }

    #[test]
    fn test_navigation_keys_work_in_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);

        assert_eq!(app.selected_index, 0);

        let j_key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(j_key);
        assert_eq!(app.selected_index, 1, "'j' should navigate in OrchestrationList");

        let k_key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(k_key);
        assert_eq!(app.selected_index, 0, "'k' should navigate in OrchestrationList");
    }

    #[test]
    fn test_keys_dispatch_based_on_view_state() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);

        // In OrchestrationList, j/k should navigate
        app.view_state = ViewState::OrchestrationList;
        assert_eq!(app.selected_index, 0);

        let j_key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(j_key.clone());
        assert_eq!(app.selected_index, 1, "'j' should navigate in OrchestrationList");

        // In PhaseDetail, j/k should NOT navigate orchestration list
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };
        let initial_index = app.selected_index;
        app.handle_key_event(j_key);
        assert_eq!(
            app.selected_index, initial_index,
            "'j' should not navigate orchestration list in PhaseDetail view"
        );
    }

    #[test]
    fn test_next_wraps_around_at_end() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![
                make_test_orchestration("project-1"),
                make_test_orchestration("project-2"),
                make_test_orchestration("project-3"),
            ],
            selected_index: 2, // Last item
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        app.next();
        assert_eq!(app.selected_index, 0, "Should wrap to first item");
    }

    #[test]
    fn test_previous_wraps_around_at_beginning() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![
                make_test_orchestration("project-1"),
                make_test_orchestration("project-2"),
                make_test_orchestration("project-3"),
            ],
            selected_index: 0, // First item
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        app.previous();
        assert_eq!(app.selected_index, 2, "Should wrap to last item");
    }

    #[test]
    fn test_next_on_empty_list() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        app.next();
        assert_eq!(app.selected_index, 0, "Should stay at 0 with empty list");
    }

    #[test]
    fn test_previous_on_empty_list() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        app.previous();
        assert_eq!(app.selected_index, 0, "Should stay at 0 with empty list");
    }

    #[test]
    fn test_ctrl_c_sets_quit_flag() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        let key = KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL);
        app.handle_key_event(key);
        assert!(app.should_quit, "Ctrl+C should set should_quit to true");
    }

    #[test]
    fn test_q_key_sets_quit_flag() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        let key = KeyEvent::new(KeyCode::Char('q'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(app.should_quit, "'q' key should set should_quit to true");
    }

    #[test]
    fn test_j_key_navigates_down() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![
                make_test_orchestration("project-1"),
                make_test_orchestration("project-2"),
            ],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert_eq!(app.selected_index, 1, "'j' should move selection down");
    }

    #[test]
    fn test_k_key_navigates_up() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![
                make_test_orchestration("project-1"),
                make_test_orchestration("project-2"),
            ],
            selected_index: 1,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert_eq!(app.selected_index, 0, "'k' should move selection up");
    }

    #[test]
    fn test_r_key_triggers_refresh() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        let key = KeyEvent::new(KeyCode::Char('r'), KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(!app.should_quit, "Refresh should not quit the app");
    }

    #[test]
    fn test_question_mark_toggles_help() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        let key = KeyEvent::new(KeyCode::Char('?'), KeyModifiers::NONE);

        // First press should show help
        app.handle_key_event(key.clone());
        assert!(app.show_help, "'?' should show help when it's hidden");

        // Second press should hide help
        app.handle_key_event(key);
        assert!(!app.show_help, "'?' should hide help when it's visible");
    }

    #[test]
    fn test_esc_closes_help_when_open() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: true,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(!app.show_help, "Esc should close help when it's open");
        assert!(!app.should_quit, "Esc should not quit when closing help");
    }

    #[test]
    fn test_esc_quits_when_help_not_open() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);
        assert!(app.should_quit, "Esc should quit when help is not open");
    }

    #[test]
    fn test_app_works_without_watcher() {
        let app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        assert_eq!(app.orchestrations.len(), 1);
        assert_eq!(app.selected_index, 0);
    }

    #[test]
    fn test_check_watcher_handles_none_gracefully() {
        let mut app = App {
            should_quit: false,
            orchestrations: vec![make_test_orchestration("project-1")],
            selected_index: 0,
            tick_rate: Duration::from_millis(100),
            show_help: false,
            watcher: None,
            last_refresh: Instant::now(),
            view_state: ViewState::OrchestrationList,
        };

        // Should not panic when watcher is None
        app.check_watcher();
        assert!(!app.should_quit);
    }

    // Task 2: Enter key handling tests
    #[test]
    fn test_enter_transitions_to_phase_detail_when_orchestrations_exist() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);
        app.selected_index = 1;
        app.view_state = ViewState::OrchestrationList;

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(
            matches!(
                app.view_state,
                ViewState::PhaseDetail {
                    focus: PaneFocus::Tasks,
                    task_index: 0,
                    member_index: 0,
                }
            ),
            "Enter should transition to PhaseDetail view with focus on Tasks"
        );
    }

    #[test]
    fn test_enter_does_nothing_when_orchestrations_list_is_empty() {
        let mut app = App::new_with_orchestrations(vec![]);
        app.view_state = ViewState::OrchestrationList;

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(
            matches!(app.view_state, ViewState::OrchestrationList),
            "Enter should not change view when orchestrations list is empty"
        );
    }

    #[test]
    fn test_down_arrow_navigates_in_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);
        app.selected_index = 0;

        let key = KeyEvent::new(KeyCode::Down, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert_eq!(app.selected_index, 1, "Down arrow should navigate down");
    }

    #[test]
    fn test_up_arrow_navigates_in_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![
            make_test_orchestration("project-1"),
            make_test_orchestration("project-2"),
        ]);
        app.selected_index = 1;

        let key = KeyEvent::new(KeyCode::Up, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert_eq!(app.selected_index, 0, "Up arrow should navigate up");
    }

    // Task 4: Phase Detail Key Handling tests

    #[test]
    fn test_t_key_switches_focus_to_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('t'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, .. } => {
                assert_eq!(focus, PaneFocus::Tasks, "'t' should switch focus to Tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_m_key_switches_focus_to_members_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('m'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, .. } => {
                assert_eq!(focus, PaneFocus::Members, "'m' should switch focus to Members pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_left_arrow_switches_focus_to_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Left, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, .. } => {
                assert_eq!(focus, PaneFocus::Tasks, "Left arrow should switch focus to Tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_right_arrow_switches_focus_to_members_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Right, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, .. } => {
                assert_eq!(focus, PaneFocus::Members, "Right arrow should switch focus to Members pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_j_key_navigates_down_in_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 1, "'j' should navigate down in tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_k_key_navigates_up_in_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 2,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 1, "'k' should navigate up in tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_j_key_wraps_around_at_end_of_tasks() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 2, // Assuming we'll wrap from 2 to 0
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 0, "'j' should wrap to beginning at end of tasks");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_k_key_wraps_around_at_beginning_of_tasks() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 2, "'k' should wrap to end at beginning of tasks");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_down_arrow_navigates_down_in_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Down, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 1, "Down arrow should navigate down in tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_up_arrow_navigates_up_in_tasks_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Up, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { task_index, .. } => {
                assert_eq!(task_index, 0, "Up arrow should navigate up in tasks pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_j_key_navigates_down_in_members_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('j'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { member_index, .. } => {
                assert_eq!(member_index, 1, "'j' should navigate down in members pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_k_key_navigates_up_in_members_pane() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 1,
        };

        let key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { member_index, .. } => {
                assert_eq!(member_index, 0, "'k' should navigate up in members pane");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_enter_on_tasks_opens_task_inspector() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 2,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::TaskInspector { task_index } => {
                assert_eq!(task_index, 2, "Enter on tasks should open TaskInspector with correct task_index");
            }
            _ => panic!("View state should be TaskInspector"),
        }
    }

    #[test]
    fn test_enter_on_members_does_nothing() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 1,
        };

        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, task_index, member_index } => {
                assert_eq!(focus, PaneFocus::Members, "Focus should remain on Members");
                assert_eq!(task_index, 0, "task_index should not change");
                assert_eq!(member_index, 1, "member_index should not change");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_l_key_on_members_opens_log_viewer() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Members,
            task_index: 0,
            member_index: 2,
        };

        let key = KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::LogViewer { agent_index, scroll_offset } => {
                assert_eq!(agent_index, 2, "'l' on members should open LogViewer with correct agent_index");
                assert_eq!(scroll_offset, 0, "scroll_offset should start at 0");
            }
            _ => panic!("View state should be LogViewer"),
        }
    }

    #[test]
    fn test_l_key_on_tasks_does_nothing() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('l'), KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, task_index, member_index } => {
                assert_eq!(focus, PaneFocus::Tasks, "Focus should remain on Tasks");
                assert_eq!(task_index, 1, "task_index should not change");
                assert_eq!(member_index, 0, "member_index should not change");
            }
            _ => panic!("View state should still be PhaseDetail"),
        }
    }

    #[test]
    fn test_esc_in_phase_detail_returns_to_orchestration_list() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 1,
            member_index: 2,
        };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        assert!(
            matches!(app.view_state, ViewState::OrchestrationList),
            "Esc in PhaseDetail should return to OrchestrationList"
        );
        assert!(!app.should_quit, "Esc should not quit the app");
    }

    #[test]
    fn test_r_key_in_phase_detail_refreshes() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::PhaseDetail {
            focus: PaneFocus::Tasks,
            task_index: 0,
            member_index: 0,
        };

        let key = KeyEvent::new(KeyCode::Char('r'), KeyModifiers::NONE);
        app.handle_key_event(key);

        // Should still be in PhaseDetail after refresh
        assert!(
            matches!(app.view_state, ViewState::PhaseDetail { .. }),
            "'r' should refresh but stay in PhaseDetail"
        );
    }

    // Task 5: Task Inspector Key Handling tests

    #[test]
    fn test_esc_in_task_inspector_returns_to_phase_detail() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::TaskInspector { task_index: 2 };

        let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
        app.handle_key_event(key);

        match app.view_state {
            ViewState::PhaseDetail { focus, task_index, member_index } => {
                assert_eq!(focus, PaneFocus::Tasks, "Should return to Tasks pane");
                assert_eq!(task_index, 2, "Should preserve task_index");
                assert_eq!(member_index, 0, "Should reset member_index to 0");
            }
            _ => panic!("Esc should return to PhaseDetail view"),
        }
    }

    #[test]
    fn test_task_inspector_ignores_other_keys() {
        let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
        app.view_state = ViewState::TaskInspector { task_index: 1 };

        // Try various keys that should do nothing
        for key_code in [KeyCode::Char('j'), KeyCode::Char('k'), KeyCode::Enter, KeyCode::Char('r')] {
            let key = KeyEvent::new(key_code, KeyModifiers::NONE);
            app.handle_key_event(key);

            // Should still be in TaskInspector
            match app.view_state {
                ViewState::TaskInspector { task_index } => {
                    assert_eq!(task_index, 1, "task_index should not change");
                }
                _ => panic!("Should remain in TaskInspector view"),
            }
        }
    }
}
