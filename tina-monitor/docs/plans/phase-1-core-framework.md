# Phase 1: Core Framework - Implementation Plan

## Overview

Build the foundational TUI framework with Panel trait, PanelGrid layout, and navigation system. This phase establishes the architecture that all subsequent phases build upon.

**Line Budget**: ~400 lines total (target ~320 for core + ~80 for integration test)

---

## Tasks

### Task 1: Panel Trait and HandleResult [~60 lines]

**File**: `src/panel.rs`

Define the core abstraction for TUI panels.

```rust
pub enum Direction {
    Up, Down, Left, Right,
}

pub enum HandleResult {
    Consumed,                    // Key was handled
    Ignored,                     // Key not relevant
    MoveFocus(Direction),        // Request focus change
    // Quicklook and EntityAction added in Phase 4
}

pub trait Panel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult;
    fn render(&self, frame: &mut Frame, area: Rect, focused: bool);
    fn name(&self) -> &'static str;
}
```

**Test**: Unit tests for HandleResult construction.

---

### Task 2: Placeholder Panels [~80 lines]

**Files**: `src/panels/mod.rs`, `src/panels/team.rs`, `src/panels/tasks.rs`, `src/panels/commits.rs`

Create minimal placeholder implementations for the four panels:

1. **TeamPanel** (top-left): "Orchestrator Team" / "Phase Team"
2. **TasksPanel** (top-right): "Tasks"
3. **CommitsPanel** (bottom-right): "Commits"

Each panel:
- Maintains a `selected: usize` index
- Renders placeholder items with selection highlight
- Implements boundary-aware navigation (returns `MoveFocus` at edges)

```rust
// Example: panels/team.rs
pub struct TeamPanel {
    title: &'static str,
    items: Vec<String>,  // Placeholder data
    selected: usize,
}

impl Panel for TeamPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        match key.code {
            KeyCode::Char('j') | KeyCode::Down => {
                if self.selected < self.items.len().saturating_sub(1) {
                    self.selected += 1;
                    HandleResult::Consumed
                } else {
                    HandleResult::MoveFocus(Direction::Down)
                }
            }
            KeyCode::Char('k') | KeyCode::Up => {
                if self.selected > 0 {
                    self.selected -= 1;
                    HandleResult::Consumed
                } else {
                    HandleResult::MoveFocus(Direction::Up)
                }
            }
            KeyCode::Char('l') | KeyCode::Right => HandleResult::MoveFocus(Direction::Right),
            KeyCode::Char('h') | KeyCode::Left => HandleResult::MoveFocus(Direction::Left),
            _ => HandleResult::Ignored,
        }
    }
    // ...
}
```

**Test**: Each panel correctly returns MoveFocus at boundaries.

---

### Task 3: PanelGrid Layout [~100 lines]

**File**: `src/layout.rs`

Manage the 2x2 grid of panels with focus tracking.

```rust
pub struct PanelGrid {
    panels: [[Box<dyn Panel>; 2]; 2],  // [row][col]
    focus: (usize, usize),  // (row, col)
}

impl PanelGrid {
    pub fn new() -> Self;
    pub fn handle_key(&mut self, key: KeyEvent) -> GridResult;
    pub fn render(&self, frame: &mut Frame, area: Rect);
    fn move_focus(&mut self, dir: Direction);
}

pub enum GridResult {
    Consumed,
    Ignored,
    GlobalAction(Action),  // For Phase 4 overlays
}
```

Grid layout:
```
┌────────────────┬────────────────┐
│ (0,0) Team     │ (0,1) Tasks    │
├────────────────┼────────────────┤
│ (1,0) Team     │ (1,1) Commits  │
└────────────────┴────────────────┘
```

Focus moves:
- Right at col 1 wraps to col 0
- Down at row 1 wraps to row 0
- Respects boundary requests from panels

**Test**: Focus navigation wraps correctly at edges.

---

### Task 4: App Shell [~80 lines]

**File**: `src/app.rs`

Minimal app wrapper handling global keys and event loop orchestration.

```rust
pub struct App {
    grid: PanelGrid,
    should_quit: bool,
}

impl App {
    pub fn new() -> Self;

    pub fn handle_key(&mut self, key: KeyEvent) {
        // Global keys first
        match key.code {
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Esc => self.should_quit = true,
            KeyCode::Char('?') => { /* Phase 4: help overlay */ }
            _ => { self.grid.handle_key(key); }
        }
    }

    pub fn render(&self, frame: &mut Frame);
    pub fn should_quit(&self) -> bool;
}
```

**Test**: Global quit keys work from any panel.

---

### Task 5: Main Entry Point [~40 lines]

**File**: `src/main.rs`

CLI setup, terminal initialization, and event loop.

```rust
#[derive(Parser)]
struct Cli {
    /// Load fixture data instead of real files
    #[arg(long)]
    fixture: Option<PathBuf>,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    // Terminal setup
    crossterm::terminal::enable_raw_mode()?;
    let mut stdout = std::io::stdout();
    crossterm::execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Event loop
    let mut app = App::new();
    while !app.should_quit() {
        terminal.draw(|f| app.render(f))?;
        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    app.handle_key(key);
                }
            }
        }
    }

    // Cleanup
    crossterm::terminal::disable_raw_mode()?;
    crossterm::execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    Ok(())
}
```

Note: `--fixture` flag is parsed but not used until Phase 2.

---

### Task 6: Integration Test with Fixture [~40 lines]

**File**: `tests/integration.rs`

Verify the app renders and navigates correctly.

```rust
#[test]
fn test_app_renders_four_panels() {
    let app = App::new();
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    terminal.draw(|f| app.render(f)).unwrap();

    let buffer = terminal.backend().buffer();
    // Assert panel titles visible
    assert!(buffer_contains(buffer, "ORCHESTRATOR TEAM"));
    assert!(buffer_contains(buffer, "TASKS"));
    assert!(buffer_contains(buffer, "COMMITS"));
}

#[test]
fn test_navigation_wraps_at_edges() {
    let mut app = App::new();
    // Start at (0,0), move right to (0,1), right again wraps to (0,0)
    app.handle_key(key('l'));
    app.handle_key(key('l'));
    // Assert focus is back at (0,0)
}

#[test]
fn test_quit_works_from_any_panel() {
    let mut app = App::new();
    assert!(!app.should_quit());
    app.handle_key(key('q'));
    assert!(app.should_quit());
}
```

---

## File Structure After Phase 1

```
tina-monitor/
├── Cargo.toml          # Updated dependencies
├── src/
│   ├── main.rs         # ~40 lines - CLI args, terminal setup, event loop
│   ├── app.rs          # ~80 lines - App struct, global keys
│   ├── panel.rs        # ~60 lines - Panel trait, HandleResult, Direction
│   ├── layout.rs       # ~100 lines - PanelGrid, focus management
│   └── panels/
│       ├── mod.rs      # ~10 lines - re-exports
│       ├── team.rs     # ~25 lines - placeholder team panel
│       ├── tasks.rs    # ~25 lines - placeholder tasks panel
│       └── commits.rs  # ~25 lines - placeholder commits panel
└── tests/
    └── integration.rs  # ~40 lines - rendering and navigation tests
```

**Total**: ~405 lines (within budget)

---

## Dependencies

No new dependencies needed - all are already in Cargo.toml:
- `ratatui` for TUI
- `crossterm` for terminal handling
- `clap` for CLI args

---

## Existing Code to Reuse

**NOTHING from existing TUI code** - the architecture is fundamentally different.

The existing `src/tui/` is a modal-based design with god-object anti-pattern. Phase 1 creates a clean foundation:
- Panel trait distributes responsibility
- Each panel owns its state
- Layout handles focus management
- App is thin wrapper for globals

We may extract utilities later (e.g., styled borders, status indicators) but start fresh for core architecture.

---

## Success Criteria

1. App launches and shows 4 panels in 2x2 grid
2. vim-style navigation (hjkl) moves between panels
3. Arrow keys also work
4. Navigation wraps at grid edges
5. `q` or `Esc` quits from any panel
6. Focused panel has visual highlight
7. All tests pass
8. Total lines < 450

---

## Not in This Phase

- Real data (Phase 2)
- Entity rendering (Phase 3)
- Overlays and actions (Phase 4)
- Dashboard header bar (Phase 3)
- File watching (Phase 2)

---

## Verification Commands

```bash
# Build
cargo build -p tina-monitor

# Run tests
cargo test -p tina-monitor

# Manual verification
cargo run -p tina-monitor
# Should see 4 panels, navigate with hjkl, quit with q
```
