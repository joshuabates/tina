//! TUI application state and event loop

use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use ratatui::{backend::Backend, Terminal};
use std::time::{Duration, Instant};

use super::ui;
use crate::data::discovery::{find_orchestrations, Orchestration};
use crate::data::watcher::{FileWatcher, WatchEvent};

/// Result type for TUI operations
pub type AppResult<T> = Result<T, Box<dyn std::error::Error>>;

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
        match key.code {
            KeyCode::Char('?') => self.show_help = !self.show_help,
            KeyCode::Esc => {
                if self.show_help {
                    self.show_help = false;
                } else {
                    self.should_quit = true;
                }
            }
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.should_quit = true
            }
            KeyCode::Char('j') => self.next(),
            KeyCode::Char('k') => self.previous(),
            KeyCode::Char('r') => {
                let _ = self.refresh();
            }
            _ => {}
        }
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
        };

        // Should not panic when watcher is None
        app.check_watcher();
        assert!(!app.should_quit);
    }
}
