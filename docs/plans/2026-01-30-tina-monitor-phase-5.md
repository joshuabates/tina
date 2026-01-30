# Phase 5: TUI Actions - Implementation Plan

## Overview

This phase adds operational control capabilities to the TUI, allowing users to interact with orchestrations and agents directly from the monitor interface.

## Prerequisites

- Phase 3 (Basic TUI) completed - TUI application structure exists
- Phase 4 (TUI Detail Views) completed - Modal system and view navigation working

## Goals

1. Terminal integration with kitty remote control and fallback support
2. Goto action (`g` key) to open terminal at worktree
3. Attach action (`a` key) to attach to tmux pane
4. Plan viewer (`p` key) to display phase plans
5. Configuration file support for user preferences

---

## Task 1: Configuration File Support

**Files:**
- CREATE: `tina-monitor/src/config.rs`
- MODIFY: `tina-monitor/src/main.rs` (load config at startup)

**Implementation:**

```rust
// src/config.rs
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct Config {
    pub terminal: TerminalConfig,
    pub tui: TuiConfig,
    pub safety: SafetyConfig,
    pub logging: LoggingConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct TerminalConfig {
    /// Terminal handler: "kitty", "iterm", "print"
    pub handler: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct TuiConfig {
    /// Refresh interval in seconds
    pub refresh_interval: u64,
    /// Log poll interval in milliseconds
    pub log_poll_interval: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct SafetyConfig {
    /// Require confirmation before sending to agents
    pub confirm_send: bool,
    /// Commands that don't require extra confirmation
    pub safe_commands: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct LoggingConfig {
    /// Log file for sent commands
    pub command_log: Option<PathBuf>,
}

impl Default for Config { /* ... */ }
impl Default for TerminalConfig { /* ... */ }
impl Default for TuiConfig { /* ... */ }
impl Default for SafetyConfig { /* ... */ }
impl Default for LoggingConfig { /* ... */ }

impl Config {
    /// Load config from ~/.config/tina-monitor/config.toml
    pub fn load() -> Result<Self> { /* ... */ }

    /// Get the config file path
    pub fn config_path() -> Option<PathBuf> { /* ... */ }
}
```

**Tests:**
- Test default config values
- Test loading from TOML file
- Test missing config file returns defaults
- Test partial config (missing fields use defaults)

---

## Task 2: Terminal Handler Module

**Files:**
- CREATE: `tina-monitor/src/terminal/mod.rs`
- CREATE: `tina-monitor/src/terminal/kitty.rs`
- CREATE: `tina-monitor/src/terminal/fallback.rs`

**Implementation:**

```rust
// src/terminal/mod.rs
mod kitty;
mod fallback;

use anyhow::Result;
use std::path::Path;

pub use kitty::KittyHandler;
pub use fallback::FallbackHandler;

/// Result of a terminal action
pub enum TerminalResult {
    /// Action succeeded
    Success,
    /// Fallback: show this command to user
    ShowCommand { command: String, description: String },
}

/// Terminal handler trait
pub trait TerminalHandler: Send + Sync {
    /// Check if this handler is available
    fn is_available(&self) -> bool;

    /// Open a new tab at the given directory
    fn open_tab_at(&self, cwd: &Path) -> Result<TerminalResult>;

    /// Open a new tab attached to a tmux session
    fn attach_tmux(&self, session_name: &str, pane_id: Option<&str>) -> Result<TerminalResult>;
}

/// Get the appropriate terminal handler based on config and environment
pub fn get_handler(preferred: &str) -> Box<dyn TerminalHandler> {
    match preferred {
        "kitty" => {
            let kitty = KittyHandler::new();
            if kitty.is_available() {
                return Box::new(kitty);
            }
        }
        // "iterm" => { /* future */ }
        _ => {}
    }
    Box::new(FallbackHandler::new())
}
```

```rust
// src/terminal/kitty.rs
use super::{TerminalHandler, TerminalResult};
use anyhow::Result;
use std::path::Path;
use std::process::Command;

pub struct KittyHandler {
    available: bool,
}

impl KittyHandler {
    pub fn new() -> Self {
        // Check if kitty remote control is available
        let available = Command::new("kitty")
            .args(["@", "ls"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        Self { available }
    }
}

impl TerminalHandler for KittyHandler {
    fn is_available(&self) -> bool {
        self.available
    }

    fn open_tab_at(&self, cwd: &Path) -> Result<TerminalResult> {
        let status = Command::new("kitty")
            .args(["@", "launch", "--type=tab", "--cwd", &cwd.display().to_string()])
            .status()?;

        if status.success() {
            Ok(TerminalResult::Success)
        } else {
            anyhow::bail!("kitty command failed with status: {}", status)
        }
    }

    fn attach_tmux(&self, session_name: &str, pane_id: Option<&str>) -> Result<TerminalResult> {
        let cmd = if let Some(pane) = pane_id {
            format!("tmux select-pane -t {} \\; attach -t {}", pane, session_name)
        } else {
            format!("tmux attach -t {}", session_name)
        };

        let status = Command::new("kitty")
            .args(["@", "launch", "--type=tab", "bash", "-c", &cmd])
            .status()?;

        if status.success() {
            Ok(TerminalResult::Success)
        } else {
            anyhow::bail!("kitty command failed with status: {}", status)
        }
    }
}
```

```rust
// src/terminal/fallback.rs
use super::{TerminalHandler, TerminalResult};
use anyhow::Result;
use std::path::Path;

pub struct FallbackHandler;

impl FallbackHandler {
    pub fn new() -> Self {
        Self
    }
}

impl TerminalHandler for FallbackHandler {
    fn is_available(&self) -> bool {
        true // Always available
    }

    fn open_tab_at(&self, cwd: &Path) -> Result<TerminalResult> {
        Ok(TerminalResult::ShowCommand {
            command: format!("cd {}", cwd.display()),
            description: "Open a terminal and run this command".to_string(),
        })
    }

    fn attach_tmux(&self, session_name: &str, pane_id: Option<&str>) -> Result<TerminalResult> {
        let command = if let Some(pane) = pane_id {
            format!("tmux select-pane -t {} && tmux attach -t {}", pane, session_name)
        } else {
            format!("tmux attach -t {}", session_name)
        };

        Ok(TerminalResult::ShowCommand {
            command,
            description: "Run this command in a new terminal".to_string(),
        })
    }
}
```

**Tests:**
- Test KittyHandler availability detection
- Test FallbackHandler always returns ShowCommand
- Test command string generation for both handlers

---

## Task 3: Goto Action (g key)

**Files:**
- MODIFY: `tina-monitor/src/tui/app.rs` (add goto action handler)
- CREATE: `tina-monitor/src/tui/views/command_modal.rs` (show fallback commands)

**Implementation:**

Add to app.rs:
```rust
use crate::terminal::{get_handler, TerminalResult};

impl App {
    /// Handle 'g' key - goto worktree in new terminal
    pub fn handle_goto(&mut self) -> Result<()> {
        // Get selected orchestration's cwd
        let cwd = match self.get_selected_orchestration() {
            Some(orch) => orch.cwd.clone(),
            None => return Ok(()),
        };

        let handler = get_handler(&self.config.terminal.handler);
        match handler.open_tab_at(&cwd)? {
            TerminalResult::Success => {
                self.set_status_message("Opened new terminal tab");
            }
            TerminalResult::ShowCommand { command, description } => {
                self.show_command_modal(command, description);
            }
        }
        Ok(())
    }
}
```

Command modal view:
```rust
// src/tui/views/command_modal.rs
pub struct CommandModal {
    pub command: String,
    pub description: String,
    pub copied: bool,
}

impl CommandModal {
    pub fn new(command: String, description: String) -> Self {
        Self { command, description, copied: false }
    }

    /// Copy command to clipboard
    pub fn copy_to_clipboard(&mut self) -> Result<()> {
        use arboard::Clipboard;
        let mut clipboard = Clipboard::new()?;
        clipboard.set_text(&self.command)?;
        self.copied = true;
        Ok(())
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        // Render modal with command, description, and [y] Copy hint
    }
}
```

**Keybindings:**
- `g` when orchestration selected: open goto action
- In command modal: `y` to copy, `Esc` to close

---

## Task 4: Attach Action (a key)

**Files:**
- MODIFY: `tina-monitor/src/tui/app.rs` (add attach action handler)
- MODIFY: `tina-monitor/src/data/teams.rs` (ensure tmux_pane_id is available)

**Implementation:**

Add to app.rs:
```rust
impl App {
    /// Handle 'a' key - attach to agent's tmux pane
    pub fn handle_attach(&mut self) -> Result<()> {
        // Get selected agent
        let agent = match self.get_selected_agent() {
            Some(agent) => agent,
            None => return Ok(()),
        };

        // Need both session name and optionally pane id
        let session_name = self.get_tmux_session_for_agent(&agent);
        let pane_id = agent.tmux_pane_id.as_deref();

        let handler = get_handler(&self.config.terminal.handler);
        match handler.attach_tmux(&session_name, pane_id)? {
            TerminalResult::Success => {
                self.set_status_message(&format!("Attached to {}", agent.name));
            }
            TerminalResult::ShowCommand { command, description } => {
                self.show_command_modal(command, description);
            }
        }
        Ok(())
    }

    fn get_tmux_session_for_agent(&self, agent: &Agent) -> String {
        // Derive session name from team name
        // Convention: tina-{team-name}
        format!("tina-{}", self.current_team_name())
    }
}
```

**Keybindings:**
- `a` when agent selected in phase detail view: attach to pane

---

## Task 5: Plan Viewer (p key)

**Files:**
- CREATE: `tina-monitor/src/tui/views/plan_viewer.rs`
- MODIFY: `tina-monitor/src/tui/app.rs` (add plan view handler)

**Implementation:**

```rust
// src/tui/views/plan_viewer.rs
use ratatui::prelude::*;
use ratatui::widgets::{Block, Borders, Paragraph, Scrollbar, ScrollbarOrientation, ScrollbarState};

pub struct PlanViewer {
    /// Path to the plan file
    pub path: PathBuf,
    /// Loaded content (markdown)
    pub content: String,
    /// Scroll position
    pub scroll: u16,
    /// Total lines
    pub total_lines: u16,
}

impl PlanViewer {
    pub fn new(path: PathBuf) -> Result<Self> {
        let content = std::fs::read_to_string(&path)?;
        let total_lines = content.lines().count() as u16;
        Ok(Self {
            path,
            content,
            scroll: 0,
            total_lines,
        })
    }

    pub fn scroll_down(&mut self, amount: u16) {
        self.scroll = self.scroll.saturating_add(amount);
    }

    pub fn scroll_up(&mut self, amount: u16) {
        self.scroll = self.scroll.saturating_sub(amount);
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let title = format!(" Plan: {} ", self.path.file_name().unwrap().to_string_lossy());

        let block = Block::default()
            .title(title)
            .borders(Borders::ALL);

        let inner = block.inner(area);
        frame.render_widget(block, area);

        // Render markdown content (basic - just text for now)
        let visible_lines: Vec<&str> = self.content
            .lines()
            .skip(self.scroll as usize)
            .take(inner.height as usize)
            .collect();

        let text = visible_lines.join("\n");
        let paragraph = Paragraph::new(text);
        frame.render_widget(paragraph, inner);

        // Scrollbar
        let scrollbar = Scrollbar::default()
            .orientation(ScrollbarOrientation::VerticalRight);
        let mut scrollbar_state = ScrollbarState::default()
            .content_length(self.total_lines as usize)
            .position(self.scroll as usize);
        frame.render_stateful_widget(scrollbar, area, &mut scrollbar_state);
    }
}
```

Add to app.rs:
```rust
impl App {
    /// Handle 'p' key - view plan for current orchestration/phase
    pub fn handle_view_plan(&mut self) -> Result<()> {
        let plan_path = match self.get_current_plan_path() {
            Some(path) => path,
            None => {
                self.set_status_message("No plan available");
                return Ok(());
            }
        };

        let viewer = PlanViewer::new(plan_path)?;
        self.push_modal(Modal::PlanViewer(viewer));
        Ok(())
    }

    fn get_current_plan_path(&self) -> Option<PathBuf> {
        // Get plan path from supervisor state or task metadata
        let orch = self.get_selected_orchestration()?;
        let phase = orch.current_phase;
        orch.plan_paths.get(&phase).cloned()
    }
}
```

**Keybindings:**
- `p` when orchestration selected: view current phase plan
- In plan viewer: `j`/`k` or arrows to scroll, `Esc` to close

---

## Task 6: Integration and Polish

**Files:**
- MODIFY: `tina-monitor/src/tui/app.rs` (wire everything together)
- MODIFY: `tina-monitor/src/tui/ui.rs` (add status bar messages)
- MODIFY: `tina-monitor/src/main.rs` (load config, pass to app)

**Implementation:**

Update main.rs:
```rust
fn main() -> Result<()> {
    // Load config
    let config = Config::load().unwrap_or_default();

    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Status { .. }) => { /* ... */ }
        Some(Commands::Teams { .. }) => { /* ... */ }
        Some(Commands::Tasks { .. }) => { /* ... */ }
        None => {
            // Launch TUI with config
            run_tui(config)?;
        }
    }

    Ok(())
}
```

Update app event handling:
```rust
impl App {
    pub fn handle_key_event(&mut self, key: KeyEvent) -> Result<bool> {
        // Handle modal-specific keys first
        if self.has_modal() {
            return self.handle_modal_key(key);
        }

        match key.code {
            KeyCode::Char('q') => return Ok(true), // quit
            KeyCode::Char('r') => self.refresh()?,
            KeyCode::Char('g') => self.handle_goto()?,
            KeyCode::Char('a') => self.handle_attach()?,
            KeyCode::Char('p') => self.handle_view_plan()?,
            KeyCode::Char('?') => self.show_help_modal(),
            // ... other keys
            _ => {}
        }

        Ok(false)
    }
}
```

---

## Task 7: Help Modal Update

**Files:**
- MODIFY: `tina-monitor/src/tui/views/help_modal.rs` (add new keybindings)

Update help modal to include new keybindings:
```
┌─ Help ──────────────────────────────────────────────────────────────────┐
│                                                                         │
│ Navigation                                                              │
│   j/k or ↑/↓   Move selection up/down                                  │
│   Enter        Expand/collapse or select                                │
│   Esc          Close modal or go back                                   │
│   t            Focus task list (in phase view)                          │
│   m            Focus team members (in phase view)                       │
│                                                                         │
│ Actions                                                                 │
│   g            Open terminal at worktree (goto)                         │
│   a            Attach to agent's tmux pane                              │
│   p            View current phase plan                                  │
│   l            View agent logs                                          │
│   r            Force refresh                                            │
│                                                                         │
│ Other                                                                   │
│   ?            Show this help                                           │
│   q            Quit                                                     │
│                                                                         │
│                                                             [ESC] Close │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Task 8: Tests

**Files:**
- CREATE: `tina-monitor/tests/config_tests.rs`
- CREATE: `tina-monitor/tests/terminal_tests.rs`
- MODIFY: `tina-monitor/tests/fixtures/` (add sample config)

**Test Cases:**

Config tests:
- `test_default_config_values` - verify defaults
- `test_load_config_from_file` - load sample toml
- `test_partial_config_uses_defaults` - missing fields get defaults
- `test_config_path_detection` - finds ~/.config/tina-monitor/

Terminal tests:
- `test_kitty_handler_command_generation` - verify kitty commands
- `test_fallback_handler_returns_show_command` - always ShowCommand
- `test_handler_selection` - get_handler respects config

Sample config fixture:
```toml
# tests/fixtures/config/config.toml
[terminal]
handler = "kitty"

[tui]
refresh_interval = 10
log_poll_interval = 250

[safety]
confirm_send = true
safe_commands = ["/checkpoint", "/clear"]

[logging]
command_log = "~/.local/share/tina-monitor/commands.log"
```

---

## Dependencies

Add to Cargo.toml if not already present:
```toml
toml = "0.8"
arboard = "3"
shellexpand = "3"
```

---

## Success Criteria

1. Configuration file loads from `~/.config/tina-monitor/config.toml`
2. Missing config file uses sensible defaults
3. `g` key opens new kitty tab at worktree cwd (or shows command)
4. `a` key attaches to selected agent's tmux pane (or shows command)
5. `p` key opens scrollable plan viewer modal
6. Help modal shows all new keybindings
7. All tests pass

---

## Estimated Work

| Task | Effort |
|------|--------|
| Task 1: Config support | Small |
| Task 2: Terminal module | Medium |
| Task 3: Goto action | Small |
| Task 4: Attach action | Small |
| Task 5: Plan viewer | Medium |
| Task 6: Integration | Small |
| Task 7: Help update | Small |
| Task 8: Tests | Medium |

---

## Notes

- The design mentions iTerm2 support as "future" - we skip it for this phase
- Plan viewer renders plain text for now; markdown rendering can be enhanced later
- Clipboard functionality (arboard) may need testing on different platforms
