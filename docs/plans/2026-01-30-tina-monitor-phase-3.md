# Tina Monitor Phase 3: Basic TUI Implementation Plan

## Overview

Phase 3 implements the interactive TUI for tina-monitor, providing a real-time orchestration list with file watching for automatic updates.

## Prerequisites

- Phase 1 complete: Core data model and CLI status command working
- Phase 2 complete: Skill integration with CLI-based monitoring

## Goals

1. Interactive TUI showing all active orchestrations
2. Real-time status updates via file watching
3. Keyboard navigation (j/k, q, r)
4. Clean terminal handling with crossterm

## Tasks

### Task 1: TUI Module Structure

**Description:** Create the base TUI module structure and crossterm terminal setup.

**Files to create:**
- `tina-monitor/src/tui/mod.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/mod.rs
mod app;
mod ui;
pub mod views;
pub mod widgets;

pub use app::{App, AppResult};

use std::io;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};

pub fn run() -> AppResult<()> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create and run app
    let mut app = App::new()?;
    let result = app.run(&mut terminal);

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    result
}
```

**Tests:**
- Terminal setup/teardown doesn't panic
- Module exports are correct

**Acceptance criteria:**
- TUI module compiles
- Terminal enters/exits alternate screen cleanly

---

### Task 2: App State and Event Loop

**Description:** Implement the main App struct with state management and event loop.

**Files to create:**
- `tina-monitor/src/tui/app.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/app.rs
use std::time::Duration;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers};
use ratatui::{backend::Backend, Terminal};

use crate::data::discovery::discover_orchestrations;
use crate::data::Orchestration;

pub type AppResult<T> = std::result::Result<T, Box<dyn std::error::Error>>;

pub struct App {
    /// Is the application running?
    pub running: bool,

    /// Current list of orchestrations
    pub orchestrations: Vec<Orchestration>,

    /// Currently selected index in the list
    pub selected_index: usize,

    /// Tick rate for polling
    pub tick_rate: Duration,
}

impl App {
    pub fn new() -> AppResult<Self> {
        let orchestrations = discover_orchestrations()?;
        Ok(Self {
            running: true,
            orchestrations,
            selected_index: 0,
            tick_rate: Duration::from_millis(250),
        })
    }

    pub fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> AppResult<()> {
        while self.running {
            terminal.draw(|frame| crate::tui::ui::render(frame, self))?;

            if event::poll(self.tick_rate)? {
                if let Event::Key(key) = event::read()? {
                    self.handle_key(key);
                }
            }
        }
        Ok(())
    }

    fn handle_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Char('q') => self.running = false,
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.running = false;
            }
            KeyCode::Char('j') | KeyCode::Down => self.next(),
            KeyCode::Char('k') | KeyCode::Up => self.previous(),
            KeyCode::Char('r') => self.refresh(),
            _ => {}
        }
    }

    fn next(&mut self) {
        if !self.orchestrations.is_empty() {
            self.selected_index = (self.selected_index + 1) % self.orchestrations.len();
        }
    }

    fn previous(&mut self) {
        if !self.orchestrations.is_empty() {
            self.selected_index = self.selected_index
                .checked_sub(1)
                .unwrap_or(self.orchestrations.len().saturating_sub(1));
        }
    }

    fn refresh(&mut self) {
        if let Ok(orchestrations) = discover_orchestrations() {
            self.orchestrations = orchestrations;
            // Clamp selected index
            if self.selected_index >= self.orchestrations.len() {
                self.selected_index = self.orchestrations.len().saturating_sub(1);
            }
        }
    }
}
```

**Tests:**
- `next()` wraps around at end
- `previous()` wraps around at beginning
- `refresh()` updates orchestrations list
- Ctrl+C and 'q' set running to false

**Acceptance criteria:**
- Event loop processes keyboard input
- Navigation wraps correctly
- Manual refresh works

---

### Task 3: Main UI Render Function

**Description:** Implement the main render function that lays out the TUI.

**Files to create:**
- `tina-monitor/src/tui/ui.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/ui.rs
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use super::app::App;
use super::views::orchestration_list::render_orchestration_list;

pub fn render(frame: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Header
            Constraint::Min(0),     // Main content
            Constraint::Length(1),  // Footer
        ])
        .split(frame.area());

    render_header(frame, chunks[0]);
    render_orchestration_list(frame, chunks[1], app);
    render_footer(frame, chunks[2]);
}

fn render_header(frame: &mut Frame, area: Rect) {
    let header = Paragraph::new("Orchestrations")
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(Block::default().borders(Borders::BOTTOM));
    frame.render_widget(header, area);
}

fn render_footer(frame: &mut Frame, area: Rect) {
    let footer = Paragraph::new(" j/k:nav  r:refresh  q:quit  ?:help")
        .style(Style::default().fg(Color::DarkGray));
    frame.render_widget(footer, area);
}
```

**Tests:**
- Render function doesn't panic with empty orchestrations
- Layout constraints are reasonable

**Acceptance criteria:**
- Header, content area, and footer render correctly
- Layout adapts to terminal size

---

### Task 4: Views Module Structure

**Description:** Create the views module with orchestration list view.

**Files to create:**
- `tina-monitor/src/tui/views/mod.rs`
- `tina-monitor/src/tui/views/orchestration_list.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/views/mod.rs
pub mod orchestration_list;
```

```rust
// tina-monitor/src/tui/views/orchestration_list.rs
use ratatui::{
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState},
    Frame,
};

use crate::tui::app::App;
use crate::tui::widgets::{progress_bar, status_indicator};
use crate::data::{Orchestration, OrchestrationStatus};

pub fn render_orchestration_list(frame: &mut Frame, area: Rect, app: &App) {
    let items: Vec<ListItem> = app
        .orchestrations
        .iter()
        .map(|orch| {
            let name = truncate_name(&orch.team_name, 25);
            let path = shorten_path(&orch.cwd, 30);
            let phase = format!("{}/{}", orch.current_phase, orch.total_phases);
            let progress = progress_bar::render(orch.tasks_completed(), orch.tasks_total(), 10);
            let context = orch.context_percent
                .map(|p| format!("ctx:{}%", p))
                .unwrap_or_else(|| "ctx:--".to_string());
            let status = status_indicator::render(&orch.status);

            let line = Line::from(vec![
                Span::styled(format!("{:<25} ", name), Style::default()),
                Span::styled(format!("{:<30} ", path), Style::default().fg(Color::DarkGray)),
                Span::styled(format!("{:<5} ", phase), Style::default()),
                Span::raw(progress),
                Span::raw("  "),
                Span::styled(format!("{:<7} ", context), Style::default().fg(Color::Yellow)),
                status,
            ]);
            ListItem::new(line)
        })
        .collect();

    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL).title("Active Orchestrations"))
        .highlight_style(
            Style::default()
                .add_modifier(Modifier::BOLD)
                .add_modifier(Modifier::REVERSED),
        )
        .highlight_symbol("> ");

    let mut state = ListState::default();
    state.select(Some(app.selected_index));

    frame.render_stateful_widget(list, area, &mut state);
}

fn truncate_name(name: &str, max_len: usize) -> String {
    // Remove common suffixes for display
    let display = name
        .trim_end_matches("-orchestration")
        .trim_end_matches("-execution");

    if display.len() > max_len {
        format!("{}...", &display[..max_len - 3])
    } else {
        display.to_string()
    }
}

fn shorten_path(path: &std::path::Path, max_len: usize) -> String {
    let path_str = path.to_string_lossy();

    // Replace home dir with ~
    let home = dirs::home_dir()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_default();

    let shortened = if path_str.starts_with(&home) {
        format!("~{}", &path_str[home.len()..])
    } else {
        path_str.to_string()
    };

    if shortened.len() > max_len {
        format!("...{}", &shortened[shortened.len() - max_len + 3..])
    } else {
        shortened
    }
}
```

**Tests:**
- `truncate_name` handles various suffixes
- `shorten_path` replaces home dir with ~
- Empty orchestrations list renders without panic

**Acceptance criteria:**
- Orchestration list displays all orchestrations
- Current selection is highlighted
- Paths are shortened appropriately

---

### Task 5: Widgets Module

**Description:** Create reusable widgets for progress bar and status indicator.

**Files to create:**
- `tina-monitor/src/tui/widgets/mod.rs`
- `tina-monitor/src/tui/widgets/progress_bar.rs`
- `tina-monitor/src/tui/widgets/status_indicator.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/widgets/mod.rs
pub mod progress_bar;
pub mod status_indicator;
```

```rust
// tina-monitor/src/tui/widgets/progress_bar.rs
use ratatui::style::{Color, Style};
use ratatui::text::Span;

/// Render a text-based progress bar
/// Example: "████████░░" for 80% complete
pub fn render(completed: usize, total: usize, width: usize) -> String {
    if total == 0 {
        return "░".repeat(width);
    }

    let filled = (completed * width) / total;
    let empty = width - filled;

    format!("{}{}", "█".repeat(filled), "░".repeat(empty))
}

/// Render a styled progress bar span
pub fn render_styled<'a>(completed: usize, total: usize, width: usize) -> Span<'a> {
    let bar = render(completed, total, width);
    let color = if total == 0 {
        Color::DarkGray
    } else if completed == total {
        Color::Green
    } else {
        Color::Blue
    };

    Span::styled(bar, Style::default().fg(color))
}
```

```rust
// tina-monitor/src/tui/widgets/status_indicator.rs
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Span;

use crate::data::OrchestrationStatus;

/// Render a status indicator span
pub fn render(status: &OrchestrationStatus) -> Span<'static> {
    match status {
        OrchestrationStatus::Executing { phase } => {
            Span::styled(
                format!("phase {}", phase),
                Style::default().fg(Color::Green),
            )
        }
        OrchestrationStatus::Blocked { phase, reason: _ } => {
            Span::styled(
                "BLOCKED",
                Style::default()
                    .fg(Color::Red)
                    .add_modifier(Modifier::BOLD),
            )
        }
        OrchestrationStatus::Complete => {
            Span::styled(
                "complete",
                Style::default().fg(Color::Cyan),
            )
        }
        OrchestrationStatus::Idle => {
            Span::styled(
                "idle",
                Style::default().fg(Color::DarkGray),
            )
        }
    }
}
```

**Tests:**
- Progress bar shows correct fill ratio
- Status indicator returns correct colors for each status
- Edge cases: 0/0, 5/5, 0/10

**Acceptance criteria:**
- Progress bars display correctly
- Status indicators are color-coded

---

### Task 6: File Watcher

**Description:** Implement file watching for automatic TUI refresh.

**Files to create:**
- `tina-monitor/src/data/watcher.rs`

**Implementation:**
```rust
// tina-monitor/src/data/watcher.rs
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::Duration;

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};

/// Events that the watcher can send
pub enum WatchEvent {
    /// Data files changed, refresh needed
    Refresh,
    /// Error occurred during watching
    Error(String),
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    pub receiver: Receiver<WatchEvent>,
}

impl FileWatcher {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let (tx, rx) = channel();

        let event_tx = tx.clone();
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                match res {
                    Ok(_event) => {
                        // Debounce by just sending refresh
                        let _ = event_tx.send(WatchEvent::Refresh);
                    }
                    Err(e) => {
                        let _ = event_tx.send(WatchEvent::Error(e.to_string()));
                    }
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )?;

        // Watch teams directory
        let teams_dir = dirs::home_dir()
            .map(|h| h.join(".claude/teams"))
            .ok_or("Could not find home directory")?;

        if teams_dir.exists() {
            watcher.watch(&teams_dir, RecursiveMode::Recursive)?;
        }

        // Watch tasks directory
        let tasks_dir = dirs::home_dir()
            .map(|h| h.join(".claude/tasks"))
            .ok_or("Could not find home directory")?;

        if tasks_dir.exists() {
            watcher.watch(&tasks_dir, RecursiveMode::Recursive)?;
        }

        Ok(Self {
            _watcher: watcher,
            receiver: rx,
        })
    }

    /// Try to receive a watch event (non-blocking)
    pub fn try_recv(&self) -> Option<WatchEvent> {
        self.receiver.try_recv().ok()
    }
}
```

**Tests:**
- Watcher initializes without error
- Watcher handles missing directories gracefully
- Events are received when files change (integration test)

**Acceptance criteria:**
- File watcher monitors ~/.claude/teams and ~/.claude/tasks
- Changes trigger refresh events

---

### Task 7: Integrate File Watcher into App

**Description:** Update App to use file watcher for automatic refresh.

**Files to modify:**
- `tina-monitor/src/tui/app.rs`

**Implementation changes:**
```rust
// Add to App struct
pub struct App {
    // ... existing fields ...

    /// File watcher for automatic refresh
    watcher: Option<FileWatcher>,

    /// Time of last refresh (for debouncing)
    last_refresh: std::time::Instant,
}

impl App {
    pub fn new() -> AppResult<Self> {
        let orchestrations = discover_orchestrations()?;
        let watcher = FileWatcher::new().ok(); // Don't fail if watcher can't start

        Ok(Self {
            running: true,
            orchestrations,
            selected_index: 0,
            tick_rate: Duration::from_millis(250),
            watcher,
            last_refresh: std::time::Instant::now(),
        })
    }

    pub fn run<B: Backend>(&mut self, terminal: &mut Terminal<B>) -> AppResult<()> {
        while self.running {
            terminal.draw(|frame| crate::tui::ui::render(frame, self))?;

            // Check for file watcher events
            self.check_watcher();

            if event::poll(self.tick_rate)? {
                if let Event::Key(key) = event::read()? {
                    self.handle_key(key);
                }
            }
        }
        Ok(())
    }

    fn check_watcher(&mut self) {
        if let Some(ref watcher) = self.watcher {
            while let Some(event) = watcher.try_recv() {
                match event {
                    WatchEvent::Refresh => {
                        // Debounce: only refresh if 500ms since last refresh
                        if self.last_refresh.elapsed() > Duration::from_millis(500) {
                            self.refresh();
                            self.last_refresh = std::time::Instant::now();
                        }
                    }
                    WatchEvent::Error(e) => {
                        // Log error but don't crash
                        eprintln!("Watcher error: {}", e);
                    }
                }
            }
        }
    }
}
```

**Tests:**
- App continues to work without watcher
- Debouncing prevents rapid refreshes

**Acceptance criteria:**
- TUI auto-refreshes when team/task files change
- Debouncing prevents excessive refreshes

---

### Task 8: Update main.rs for TUI Mode

**Description:** Update main entry point to launch TUI when no subcommand given.

**Files to modify:**
- `tina-monitor/src/main.rs`

**Implementation changes:**
```rust
// In main.rs, after CLI parsing

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Status { entity, name, format, check }) => {
            cli::status::run(entity, name, format, check)
        }
        Some(Commands::Teams { format, filter }) => {
            cli::teams::run(format, filter)
        }
        Some(Commands::Tasks { team_name, format, status }) => {
            cli::tasks::run(team_name, format, status)
        }
        None => {
            // No command = launch TUI
            tui::run()
        }
    }
}
```

**Tests:**
- Running without arguments launches TUI
- Running with `status` runs CLI mode

**Acceptance criteria:**
- `tina-monitor` (no args) launches TUI
- `tina-monitor status ...` runs CLI

---

### Task 9: Add Help View

**Description:** Add a help modal showing keybindings.

**Files to create:**
- `tina-monitor/src/tui/views/help.rs`

**Files to modify:**
- `tina-monitor/src/tui/views/mod.rs`
- `tina-monitor/src/tui/app.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/views/help.rs
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};

pub fn render_help(frame: &mut Frame) {
    let area = centered_rect(60, 60, frame.area());

    // Clear the area first
    frame.render_widget(Clear, area);

    let help_text = vec![
        Line::from(vec![
            Span::styled("Navigation", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from(""),
        Line::from("  j / Down     Move down"),
        Line::from("  k / Up       Move up"),
        Line::from("  Enter        Expand/collapse (future)"),
        Line::from(""),
        Line::from(vec![
            Span::styled("Actions", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from(""),
        Line::from("  r            Refresh data"),
        Line::from("  ?            Toggle this help"),
        Line::from("  q / Ctrl+C   Quit"),
    ];

    let help = Paragraph::new(help_text)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Help ")
                .title_alignment(Alignment::Center),
        )
        .style(Style::default().fg(Color::White));

    frame.render_widget(help, area);
}

/// Helper to create a centered rect
fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}
```

**App changes:**
```rust
// Add to App struct
pub show_help: bool,

// Add to handle_key
KeyCode::Char('?') => self.show_help = !self.show_help,
KeyCode::Esc if self.show_help => self.show_help = false,

// In ui.rs render function, after main content
if app.show_help {
    views::help::render_help(frame);
}
```

**Tests:**
- Help modal renders without panic
- `?` toggles help visibility
- `Esc` closes help

**Acceptance criteria:**
- `?` shows help modal
- `Esc` or `?` again closes it

---

### Task 10: Integration Testing

**Description:** Create integration tests for the TUI and file watcher.

**Files to create:**
- `tina-monitor/tests/tui_tests.rs`

**Implementation:**
```rust
// tina-monitor/tests/tui_tests.rs
use std::fs;
use std::path::PathBuf;
use tempfile::TempDir;

mod common;

#[test]
fn test_empty_state_renders() {
    // Test that TUI can render with no orchestrations
    // This is a smoke test - actual rendering tests are difficult
}

#[test]
fn test_file_watcher_detects_changes() {
    let temp = TempDir::new().unwrap();

    // Create mock teams directory
    let teams_dir = temp.path().join(".claude/teams");
    fs::create_dir_all(&teams_dir).unwrap();

    // Create mock team file
    let team_file = teams_dir.join("test-team/config.json");
    fs::create_dir_all(team_file.parent().unwrap()).unwrap();
    fs::write(&team_file, r#"{"name": "test-team"}"#).unwrap();

    // Verify watcher can be created
    // Note: Full watcher test requires modifying HOME env var
}

#[test]
fn test_orchestration_list_navigation() {
    // Unit test for navigation logic
    use tina_monitor::tui::app::App;

    // This requires mocking discover_orchestrations
    // or using test fixtures
}
```

**Acceptance criteria:**
- Integration tests pass
- TUI handles edge cases (empty list, single item)

---

## Dependencies

All tasks in sequence, except:
- Task 4 (views) and Task 5 (widgets) can be developed in parallel
- Task 9 (help view) can be done after Task 3

## Estimated Complexity

| Task | Complexity | Notes |
|------|------------|-------|
| 1. TUI Module Structure | Low | Boilerplate setup |
| 2. App State and Event Loop | Medium | Core application logic |
| 3. Main UI Render | Low | Layout setup |
| 4. Views Module | Medium | List rendering with widgets |
| 5. Widgets Module | Low | Simple text formatting |
| 6. File Watcher | Medium | notify crate integration |
| 7. Watcher Integration | Low | Connecting pieces |
| 8. main.rs Update | Low | CLI routing |
| 9. Help View | Low | Modal rendering |
| 10. Integration Testing | Medium | Test infrastructure |

## Testing Strategy

1. **Unit tests** for each widget and utility function
2. **Integration tests** for file watcher behavior
3. **Manual testing** against real orchestration data

## Success Criteria

1. TUI launches with `tina-monitor` command
2. Shows all active orchestrations from ~/.claude/teams
3. j/k navigation works with wrap-around
4. `r` manually refreshes the list
5. `q` exits cleanly
6. `?` shows help modal
7. Auto-refreshes when team/task files change (within 1 second)
8. Clean terminal restoration on exit (no garbage)
