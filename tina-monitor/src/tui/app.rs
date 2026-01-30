//! TUI application state and event loop

use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use ratatui::{backend::Backend, Terminal};

use super::ui;

/// Result type for TUI operations
pub type AppResult<T> = Result<T, Box<dyn std::error::Error>>;

/// Main TUI application state
pub struct App {
    /// Whether the application should quit
    pub should_quit: bool,
}

impl App {
    /// Create a new App instance
    pub fn new() -> AppResult<Self> {
        Ok(Self { should_quit: false })
    }

    /// Run the application event loop
    pub fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> AppResult<()> {
        while !self.should_quit {
            terminal.draw(|frame| ui::render(frame, self))?;
            self.handle_events()?;
        }
        Ok(())
    }

    /// Handle terminal events
    fn handle_events(&mut self) -> AppResult<()> {
        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('q') | KeyCode::Esc => self.should_quit = true,
                        _ => {}
                    }
                }
            }
        }
        Ok(())
    }
}
