# Phase 4: Overlays & Actions - Implementation Plan

## Overview

Build the overlay system (Quicklook, Fuzzy Finder, Help Screen) and action execution (tmux attach, send commands). This phase adds interactivity to the dashboard built in Phases 1-3.

**Line Budget**: ~340 lines total (from design doc)
- overlay/quicklook.rs: ~100 lines
- overlay/fuzzy.rs: ~100 lines
- overlay/help.rs: ~60 lines
- overlay/mod.rs: ~20 lines
- actions.rs: ~80 lines

---

## Architecture

### Overlay System

Overlays are modal dialogs that render on top of the panel grid. The App manages overlay state.

```rust
// In app.rs
pub enum Overlay {
    None,
    Quicklook(Entity),
    FuzzyFinder(FuzzyState),
    Help,
    SendDialog(SendDialogState),
}

impl App {
    fn handle_key(&mut self, key: KeyEvent) {
        // Overlay gets priority
        if let Some(result) = self.handle_overlay_key(key) {
            match result {
                OverlayResult::Close => self.overlay = Overlay::None,
                OverlayResult::Action(action) => self.execute_action(action),
                OverlayResult::Consumed => {}
            }
            return;
        }

        // Global keys
        match key.code {
            KeyCode::Char('?') => self.overlay = Overlay::Help,
            KeyCode::Char('/') => self.overlay = Overlay::FuzzyFinder(FuzzyState::new()),
            _ => { /* delegate to grid */ }
        }
    }
}
```

### Entity Actions from Panel

When a panel returns `HandleResult::Quicklook(entity)` or `HandleResult::EntityAction(action)`, the App handles it:

```rust
// In layout.rs - extend HandleResult from Phase 1
pub enum HandleResult {
    Consumed,
    Ignored,
    MoveFocus(Direction),
    Quicklook(Entity),      // Added Phase 4
    EntityAction(EntityAction), // Added Phase 4
}
```

---

## Tasks

### Task 1: Overlay Module Structure [~20 lines]

**File**: `src/overlay/mod.rs`

Create the overlay module with common utilities.

```rust
pub mod quicklook;
pub mod fuzzy;
pub mod help;

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
};

/// Calculate a centered rectangle with given percentage dimensions
pub fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
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

**Test**: Unit test for `centered_rect` dimensions.

---

### Task 2: Help Overlay [~60 lines]

**File**: `src/overlay/help.rs`

Static help screen showing keybindings. Simpler than old implementation - just shows the new dashboard keybindings.

```rust
use ratatui::{
    layout::{Alignment, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};
use super::centered_rect;

pub fn render(frame: &mut Frame) {
    let area = centered_rect(60, 70, frame.area());
    frame.render_widget(Clear, area);

    let help_text = vec![
        Line::from(Span::styled("Navigation", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  h/j/k/l or arrows   Move between panels"),
        Line::from("  Space               Quicklook selected item"),
        Line::from(""),
        Line::from(Span::styled("Team Members", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  a                   Attach to tmux session"),
        Line::from("  s                   Send command dialog"),
        Line::from(""),
        Line::from(Span::styled("Tasks", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  i                   Inspect task details"),
        Line::from("  o                   Jump to task owner"),
        Line::from(""),
        Line::from(Span::styled("Commits", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  d                   View diff"),
        Line::from("  y                   Copy SHA"),
        Line::from(""),
        Line::from(Span::styled("Global", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  /                   Fuzzy find orchestration"),
        Line::from("  ?                   This help screen"),
        Line::from("  q / Esc             Quit / close overlay"),
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

/// Handle key input for help overlay
pub fn handle_key(key: KeyEvent) -> bool {
    // Any key closes help
    matches!(key.code, KeyCode::Esc | KeyCode::Char('q') | KeyCode::Char('?'))
}
```

**Test**: Smoke test that render doesn't panic.

---

### Task 3: Quicklook Overlay [~100 lines]

**File**: `src/overlay/quicklook.rs`

Generic overlay that adapts to entity type. Shows details and available actions.

```rust
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    layout::{Alignment, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};
use crate::entity::{Entity, EntityAction};
use super::centered_rect;

pub struct QuicklookState {
    pub entity: Entity,
}

impl QuicklookState {
    pub fn new(entity: Entity) -> Self {
        Self { entity }
    }
}

/// Render the quicklook overlay
pub fn render(state: &QuicklookState, frame: &mut Frame) {
    let area = centered_rect(70, 60, frame.area());
    frame.render_widget(Clear, area);

    let mut lines = render_entity_details(&state.entity);

    // Add separator and action hints
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "Actions:",
        Style::default().add_modifier(Modifier::BOLD),
    )));

    for (key, label, _action) in state.entity.available_actions() {
        lines.push(Line::from(format!("  [{}] {}", key, label)));
    }

    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "[Space/Esc] Close",
        Style::default().fg(Color::DarkGray),
    )));

    let title = match &state.entity {
        Entity::TeamMember(m) => format!(" {} ", m.name),
        Entity::Task(t) => format!(" Task #{} ", t.id),
        Entity::Commit(c) => format!(" {} ", &c.sha[..7]),
    };

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .title_alignment(Alignment::Center),
        )
        .style(Style::default().fg(Color::White));

    frame.render_widget(paragraph, area);
}

fn render_entity_details(entity: &Entity) -> Vec<Line<'static>> {
    match entity {
        Entity::TeamMember(m) => vec![
            Line::from(vec![
                Span::styled("Name: ", Style::default().fg(Color::DarkGray)),
                Span::raw(m.name.clone()),
            ]),
            Line::from(vec![
                Span::styled("Model: ", Style::default().fg(Color::DarkGray)),
                Span::raw(m.model.clone()),
            ]),
            Line::from(vec![
                Span::styled("Pane: ", Style::default().fg(Color::DarkGray)),
                Span::raw(m.tmux_pane_id.clone().unwrap_or_else(|| "N/A".to_string())),
            ]),
        ],
        Entity::Task(t) => vec![
            Line::from(vec![
                Span::styled("Subject: ", Style::default().fg(Color::DarkGray)),
                Span::raw(t.subject.clone()),
            ]),
            Line::from(vec![
                Span::styled("Status: ", Style::default().fg(Color::DarkGray)),
                Span::raw(format!("{:?}", t.status)),
            ]),
            Line::from(vec![
                Span::styled("Owner: ", Style::default().fg(Color::DarkGray)),
                Span::raw(t.owner.clone().unwrap_or_else(|| "Unassigned".to_string())),
            ]),
            Line::from(""),
            Line::from(t.description.clone()),
        ],
        Entity::Commit(c) => vec![
            Line::from(vec![
                Span::styled("SHA: ", Style::default().fg(Color::DarkGray)),
                Span::raw(c.sha.clone()),
            ]),
            Line::from(vec![
                Span::styled("Author: ", Style::default().fg(Color::DarkGray)),
                Span::raw(c.author.clone()),
            ]),
            Line::from(""),
            Line::from(c.message.clone()),
        ],
    }
}

/// Handle key input for quicklook
pub fn handle_key(state: &QuicklookState, key: KeyEvent) -> QuicklookResult {
    match key.code {
        KeyCode::Esc | KeyCode::Char(' ') => QuicklookResult::Close,
        KeyCode::Char(c) => {
            // Check if this matches an action key
            for (action_key, _, action) in state.entity.available_actions() {
                if c == action_key {
                    return QuicklookResult::Action(action);
                }
            }
            QuicklookResult::Consumed
        }
        _ => QuicklookResult::Consumed,
    }
}

pub enum QuicklookResult {
    Close,
    Consumed,
    Action(EntityAction),
}
```

**Test**: Render tests for each entity type.

---

### Task 4: Fuzzy Finder Overlay [~100 lines]

**File**: `src/overlay/fuzzy.rs`

Project finder using nucleo for fuzzy matching.

```rust
use crossterm::event::{KeyCode, KeyEvent};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use nucleo_matcher::pattern::{Atom, AtomKind, CaseMatching};
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph},
    Frame,
};
use crate::types::OrchestrationSummary;
use super::centered_rect;

pub struct FuzzyState {
    pub query: String,
    pub selected: usize,
    pub items: Vec<OrchestrationSummary>,
    pub filtered: Vec<usize>,  // Indices into items
}

impl FuzzyState {
    pub fn new(items: Vec<OrchestrationSummary>) -> Self {
        let filtered: Vec<usize> = (0..items.len()).collect();
        Self {
            query: String::new(),
            selected: 0,
            items,
            filtered,
        }
    }

    pub fn update_filter(&mut self) {
        if self.query.is_empty() {
            self.filtered = (0..self.items.len()).collect();
            return;
        }

        let mut matcher = Matcher::new(Config::DEFAULT);
        let pattern = Atom::new(&self.query, CaseMatching::Ignore, AtomKind::Fuzzy, false);

        let mut scored: Vec<(usize, u32)> = self.items
            .iter()
            .enumerate()
            .filter_map(|(i, item)| {
                let haystack = Utf32Str::new(&item.feature, &mut vec![]);
                pattern.score(&mut matcher, haystack).map(|score| (i, score))
            })
            .collect();

        // Sort by score descending
        scored.sort_by(|a, b| b.1.cmp(&a.1));

        self.filtered = scored.into_iter().map(|(i, _)| i).collect();
        self.selected = 0;
    }

    pub fn selected_item(&self) -> Option<&OrchestrationSummary> {
        self.filtered.get(self.selected).map(|&i| &self.items[i])
    }
}

pub fn render(state: &FuzzyState, frame: &mut Frame) {
    let area = centered_rect(60, 60, frame.area());
    frame.render_widget(Clear, area);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Input
            Constraint::Min(5),     // Results
        ])
        .split(area);

    // Query input
    let input = Paragraph::new(state.query.as_str())
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Find Orchestration ")
                .title_alignment(Alignment::Center),
        );
    frame.render_widget(input, chunks[0]);

    // Results list
    let items: Vec<ListItem> = state.filtered
        .iter()
        .enumerate()
        .map(|(i, &idx)| {
            let item = &state.items[idx];
            let style = if i == state.selected {
                Style::default().add_modifier(Modifier::REVERSED)
            } else {
                Style::default()
            };
            ListItem::new(Line::from(vec![
                Span::styled(&item.feature, style),
                Span::styled(
                    format!(" ({:?})", item.status),
                    Style::default().fg(Color::DarkGray),
                ),
            ]))
        })
        .collect();

    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL));
    frame.render_widget(list, chunks[1]);
}

pub fn handle_key(state: &mut FuzzyState, key: KeyEvent) -> FuzzyResult {
    match key.code {
        KeyCode::Esc => FuzzyResult::Close,
        KeyCode::Enter => {
            if let Some(item) = state.selected_item() {
                FuzzyResult::Select(item.feature.clone())
            } else {
                FuzzyResult::Close
            }
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if state.selected > 0 {
                state.selected -= 1;
            }
            FuzzyResult::Consumed
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if state.selected < state.filtered.len().saturating_sub(1) {
                state.selected += 1;
            }
            FuzzyResult::Consumed
        }
        KeyCode::Char(c) => {
            state.query.push(c);
            state.update_filter();
            FuzzyResult::Consumed
        }
        KeyCode::Backspace => {
            state.query.pop();
            state.update_filter();
            FuzzyResult::Consumed
        }
        _ => FuzzyResult::Consumed,
    }
}

pub enum FuzzyResult {
    Close,
    Consumed,
    Select(String),  // Feature name to load
}
```

**Test**: Filter logic and selection navigation tests.

---

### Task 5: Send Dialog (Mini-Overlay) [~60 lines]

**File**: `src/overlay/send.rs` (added to overlay module)

Dialog for sending commands to an agent's tmux pane.

```rust
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::{
    layout::Alignment,
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Frame,
};
use super::centered_rect;

pub struct SendDialogState {
    pub input: String,
    pub pane_id: String,
    pub agent_name: String,
}

impl SendDialogState {
    pub fn new(pane_id: String, agent_name: String) -> Self {
        Self {
            input: String::new(),
            pane_id,
            agent_name,
        }
    }
}

pub fn render(state: &SendDialogState, frame: &mut Frame) {
    let area = centered_rect(60, 30, frame.area());
    frame.render_widget(Clear, area);

    let lines = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("Send to: ", Style::default().fg(Color::DarkGray)),
            Span::styled(&state.agent_name, Style::default().fg(Color::Cyan)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("> ", Style::default().fg(Color::Yellow)),
            Span::raw(&state.input),
            Span::styled("_", Style::default().fg(Color::White)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("[Enter] ", Style::default().fg(Color::Green)),
            Span::raw("Send  "),
            Span::styled("[Esc] ", Style::default().fg(Color::Red)),
            Span::raw("Cancel"),
        ]),
    ];

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Send Command ")
                .title_alignment(Alignment::Center),
        );

    frame.render_widget(paragraph, area);
}

pub fn handle_key(state: &mut SendDialogState, key: KeyEvent) -> SendResult {
    match key.code {
        KeyCode::Esc => SendResult::Cancel,
        KeyCode::Enter => {
            if state.input.is_empty() {
                SendResult::Consumed
            } else {
                SendResult::Send(state.pane_id.clone(), state.input.clone())
            }
        }
        KeyCode::Char(c) => {
            state.input.push(c);
            SendResult::Consumed
        }
        KeyCode::Backspace => {
            state.input.pop();
            SendResult::Consumed
        }
        _ => SendResult::Consumed,
    }
}

pub enum SendResult {
    Cancel,
    Consumed,
    Send(String, String),  // (pane_id, command)
}
```

**Test**: Input handling tests.

---

### Task 6: Actions Module [~80 lines]

**File**: `src/actions.rs`

Execute entity actions. Wraps existing tmux module and adds new actions.

```rust
use std::process::Command;
use anyhow::{Context, Result};
use crate::entity::EntityAction;
use crate::tmux;

/// Execute an entity action, returning an optional message
pub fn execute(action: EntityAction) -> Result<Option<String>> {
    match action {
        EntityAction::AttachTmux { pane_id } => {
            attach_tmux(&pane_id)?;
            Ok(None)
        }
        EntityAction::SendCommand { pane_id, command } => {
            send_command(&pane_id, &command)?;
            Ok(Some(format!("Sent: {}", command)))
        }
        EntityAction::ViewTaskDetail { task_id: _ } => {
            // Handled by quicklook - this shouldn't reach here
            Ok(None)
        }
        EntityAction::JumpToOwner { owner } => {
            Ok(Some(format!("Jump to: {}", owner)))
        }
        EntityAction::ViewDiff { sha } => {
            view_diff(&sha)?;
            Ok(None)
        }
        EntityAction::CopySha { sha } => {
            copy_to_clipboard(&sha)?;
            Ok(Some(format!("Copied: {}", sha)))
        }
    }
}

/// Attach to a tmux pane (suspends TUI)
fn attach_tmux(pane_id: &str) -> Result<()> {
    // Get the session:window.pane format
    let target = if pane_id.contains(':') {
        pane_id.to_string()
    } else {
        // Assume it's just a pane ID, get session info
        format!(":{}", pane_id)
    };

    Command::new("tmux")
        .arg("select-pane")
        .arg("-t")
        .arg(&target)
        .status()
        .context("Failed to select tmux pane")?;

    Command::new("tmux")
        .arg("attach-session")
        .status()
        .context("Failed to attach to tmux session")?;

    Ok(())
}

/// Send a command to a tmux pane
fn send_command(pane_id: &str, command: &str) -> Result<()> {
    tmux::send_keys(pane_id, command)
        .map_err(|e| anyhow::anyhow!("Failed to send command: {}", e))
}

/// View diff for a commit (opens external viewer)
fn view_diff(sha: &str) -> Result<()> {
    Command::new("git")
        .args(["show", sha, "--stat"])
        .status()
        .context("Failed to show git diff")?;
    Ok(())
}

/// Copy text to clipboard
fn copy_to_clipboard(text: &str) -> Result<()> {
    // Try pbcopy (macOS) first, then xclip (Linux)
    let result = Command::new("pbcopy")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            child.stdin.as_mut().unwrap().write_all(text.as_bytes())?;
            child.wait()
        });

    if result.is_ok() {
        return Ok(());
    }

    // Fallback to xclip
    Command::new("xclip")
        .arg("-selection")
        .arg("clipboard")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            child.stdin.as_mut().unwrap().write_all(text.as_bytes())?;
            child.wait()
        })
        .context("Failed to copy to clipboard (tried pbcopy and xclip)")?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_copy_sha_action_calls_clipboard() {
        // This test just verifies the execute function handles CopySha
        let action = EntityAction::CopySha { sha: "abc1234".to_string() };

        // Will fail if no clipboard tool, but shouldn't panic
        let _ = execute(action);
    }

    #[test]
    fn test_jump_to_owner_returns_message() {
        let action = EntityAction::JumpToOwner { owner: "worker-1".to_string() };
        let result = execute(action).unwrap();

        assert!(result.is_some());
        assert!(result.unwrap().contains("worker-1"));
    }
}
```

---

### Task 7: Entity System Update [~40 lines]

**File**: `src/entity.rs` (update from Phase 3)

Add EntityAction enum and available_actions method.

```rust
use crate::types::{TeamMember, Task, Commit};

#[derive(Debug, Clone)]
pub enum Entity {
    TeamMember(TeamMember),
    Task(Task),
    Commit(Commit),
}

#[derive(Debug, Clone)]
pub enum EntityAction {
    AttachTmux { pane_id: String },
    SendCommand { pane_id: String, command: String },
    ViewTaskDetail { task_id: String },
    JumpToOwner { owner: String },
    ViewDiff { sha: String },
    CopySha { sha: String },
}

impl Entity {
    pub fn available_actions(&self) -> Vec<(char, &'static str, EntityAction)> {
        match self {
            Entity::TeamMember(m) => {
                let mut actions = Vec::new();
                if let Some(pane_id) = &m.tmux_pane_id {
                    actions.push(('a', "Attach", EntityAction::AttachTmux {
                        pane_id: pane_id.clone()
                    }));
                    actions.push(('s', "Send", EntityAction::SendCommand {
                        pane_id: pane_id.clone(),
                        command: String::new(),
                    }));
                }
                actions
            }
            Entity::Task(t) => {
                let mut actions = vec![
                    ('i', "Inspect", EntityAction::ViewTaskDetail {
                        task_id: t.id.clone()
                    }),
                ];
                if let Some(owner) = &t.owner {
                    actions.push(('o', "Jump to owner", EntityAction::JumpToOwner {
                        owner: owner.clone()
                    }));
                }
                actions
            }
            Entity::Commit(c) => vec![
                ('d', "View diff", EntityAction::ViewDiff { sha: c.sha.clone() }),
                ('y', "Copy SHA", EntityAction::CopySha { sha: c.sha.clone() }),
            ],
        }
    }
}
```

---

### Task 8: Update Panel HandleResult [~10 lines]

**File**: `src/panel.rs` (update from Phase 1)

Extend HandleResult to support entity actions.

```rust
use crate::entity::{Entity, EntityAction};

pub enum HandleResult {
    Consumed,
    Ignored,
    MoveFocus(Direction),
    Quicklook(Entity),           // NEW
    EntityAction(EntityAction),  // NEW
}
```

---

### Task 9: App Overlay Integration [~60 lines]

**File**: `src/app.rs` (update)

Integrate overlay management into the App.

```rust
use crate::overlay::{self, quicklook, fuzzy, help, send};
use crate::entity::Entity;
use crate::actions;

pub enum Overlay {
    None,
    Help,
    Quicklook(quicklook::QuicklookState),
    FuzzyFinder(fuzzy::FuzzyState),
    SendDialog(send::SendDialogState),
}

impl App {
    pub fn handle_key(&mut self, key: KeyEvent) {
        // Overlay handling
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
                        let _ = actions::execute(action);
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
                        let _ = self.data_source.load_orchestration(&feature);
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
                        let _ = actions::execute(EntityAction::SendCommand {
                            pane_id,
                            command: cmd
                        });
                    }
                    send::SendResult::Consumed => {}
                }
                return;
            }
        }

        // Global keys
        match key.code {
            KeyCode::Char('q') | KeyCode::Esc => self.should_quit = true,
            KeyCode::Char('?') => self.overlay = Overlay::Help,
            KeyCode::Char('/') => {
                let items = self.data_source.list_orchestrations().unwrap_or_default();
                self.overlay = Overlay::FuzzyFinder(fuzzy::FuzzyState::new(items));
            }
            _ => {
                // Delegate to grid
                match self.grid.handle_key(key) {
                    GridResult::Quicklook(entity) => {
                        self.overlay = Overlay::Quicklook(quicklook::QuicklookState::new(entity));
                    }
                    GridResult::EntityAction(action) => {
                        let _ = actions::execute(action);
                    }
                    _ => {}
                }
            }
        }
    }

    pub fn render(&self, frame: &mut Frame) {
        // Render grid
        self.grid.render(frame, frame.area());

        // Render overlay on top
        match &self.overlay {
            Overlay::None => {}
            Overlay::Help => help::render(frame),
            Overlay::Quicklook(state) => quicklook::render(state, frame),
            Overlay::FuzzyFinder(state) => fuzzy::render(state, frame),
            Overlay::SendDialog(state) => send::render(state, frame),
        }
    }
}
```

---

### Task 10: Panel Space Key Handling [~20 lines]

**File**: `src/panels/team.rs`, `src/panels/tasks.rs`, `src/panels/commits.rs` (update)

Add Space key handling to open quicklook.

```rust
// Example for TeamPanel
impl Panel for TeamPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        match key.code {
            KeyCode::Char(' ') => {
                if let Some(entity) = self.selected_entity() {
                    HandleResult::Quicklook(entity)
                } else {
                    HandleResult::Consumed
                }
            }
            // ... existing navigation keys
        }
    }

    fn selected_entity(&self) -> Option<Entity> {
        self.members.get(self.selected).map(|m| Entity::TeamMember(m.clone()))
    }
}
```

---

### Task 11: Integration Tests [~50 lines]

**File**: `tests/overlay_integration.rs`

Test overlay behavior and action execution.

```rust
use tina_monitor::app::App;
use tina_monitor::overlay::Overlay;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers, KeyEventKind, KeyEventState};

fn key(code: KeyCode) -> KeyEvent {
    KeyEvent {
        code,
        modifiers: KeyModifiers::empty(),
        kind: KeyEventKind::Press,
        state: KeyEventState::NONE,
    }
}

#[test]
fn test_help_overlay_opens_with_question_mark() {
    let mut app = App::new_with_fixture(test_fixture_path());

    app.handle_key(key(KeyCode::Char('?')));

    assert!(matches!(app.overlay, Overlay::Help));
}

#[test]
fn test_help_overlay_closes_with_escape() {
    let mut app = App::new_with_fixture(test_fixture_path());
    app.overlay = Overlay::Help;

    app.handle_key(key(KeyCode::Esc));

    assert!(matches!(app.overlay, Overlay::None));
}

#[test]
fn test_fuzzy_finder_opens_with_slash() {
    let mut app = App::new_with_fixture(test_fixture_path());

    app.handle_key(key(KeyCode::Char('/')));

    assert!(matches!(app.overlay, Overlay::FuzzyFinder(_)));
}

#[test]
fn test_space_opens_quicklook_for_selected_entity() {
    let mut app = App::new_with_fixture(test_fixture_path());

    // Select first team member
    app.handle_key(key(KeyCode::Char('j')));
    app.handle_key(key(KeyCode::Char(' ')));

    assert!(matches!(app.overlay, Overlay::Quicklook(_)));
}

#[test]
fn test_fuzzy_filter_updates_on_input() {
    use tina_monitor::overlay::fuzzy::FuzzyState;
    use tina_monitor::types::OrchestrationSummary;

    let items = vec![
        OrchestrationSummary { feature: "auth-feature".to_string(), /* ... */ },
        OrchestrationSummary { feature: "payment-system".to_string(), /* ... */ },
    ];

    let mut state = FuzzyState::new(items);
    state.query = "auth".to_string();
    state.update_filter();

    assert_eq!(state.filtered.len(), 1);
    assert_eq!(state.items[state.filtered[0]].feature, "auth-feature");
}
```

---

## File Structure After Phase 4

```
tina-monitor/
├── src/
│   ├── main.rs           # ~60 lines (unchanged)
│   ├── app.rs            # ~180 lines (Phase 1 + overlay integration)
│   ├── panel.rs          # ~70 lines (Phase 1 + HandleResult extensions)
│   ├── layout.rs         # ~100 lines (unchanged)
│   ├── entity.rs         # ~60 lines (Phase 3 + available_actions)
│   ├── panels/
│   │   ├── mod.rs        # ~10 lines
│   │   ├── team.rs       # ~60 lines (Phase 3 + Space key)
│   │   ├── tasks.rs      # ~60 lines (Phase 3 + Space key)
│   │   └── commits.rs    # ~60 lines (Phase 3 + Space key)
│   ├── overlay/
│   │   ├── mod.rs        # ~20 lines (NEW)
│   │   ├── quicklook.rs  # ~100 lines (NEW)
│   │   ├── fuzzy.rs      # ~100 lines (NEW)
│   │   ├── help.rs       # ~60 lines (NEW)
│   │   └── send.rs       # ~60 lines (NEW)
│   ├── actions.rs        # ~80 lines (NEW)
│   ├── dashboard.rs      # ~80 lines (Phase 3)
│   ├── data.rs           # ~160 lines (Phase 2)
│   ├── types.rs          # ~80 lines (Phase 2)
│   └── tmux/             # Existing module (reused)
└── tests/
    ├── integration.rs    # ~40 lines (Phase 1)
    ├── data_integration.rs # ~60 lines (Phase 2)
    └── overlay_integration.rs # ~50 lines (NEW)
```

**Phase 4 Additions**: ~470 lines
**Running Total**: ~1,155 lines (within ~1,500 budget)

---

## Dependencies

Add to Cargo.toml:
```toml
[dependencies]
nucleo-matcher = "0.3"  # Fuzzy matching
```

Note: `nucleo` 0.5 mentioned in design doc, but `nucleo-matcher` 0.3 is the actual crate with Matcher API.

---

## Existing Code to Reuse

**From existing tina-monitor:**
- `src/tmux/send.rs` - Already available, use `tmux::send_keys()`
- `src/tui/views/help.rs` - Pattern for help content (but simplify keybindings list)
- `src/tui/views/send_dialog.rs` - Pattern for input dialog (but simplify)

**Do NOT reuse:**
- `src/tui/views/command_modal.rs` - Too tightly coupled to old ViewState
- `src/tui/app.rs` - God object pattern we're avoiding

---

## Success Criteria

1. `?` opens help overlay with keybindings
2. Any key closes help overlay
3. `Space` opens quicklook for selected entity
4. Quicklook shows entity-specific details and available actions
5. Action keys in quicklook execute the action
6. `/` opens fuzzy finder overlay
7. Typing in fuzzy finder filters results
8. Enter in fuzzy finder loads selected orchestration
9. `a` on team member attaches to tmux pane
10. `s` on team member opens send dialog
11. Send dialog sends command on Enter
12. `y` on commit copies SHA to clipboard
13. All tests pass
14. Total new lines < 500

---

## Not in This Phase

- Log streaming (use tmux attach)
- Diff viewer (use external git show)
- Plan viewer (use quicklook for summary, external for full)
- Error toasts/notifications (Phase 5)
- Status messages in dashboard (Phase 5)

---

## Verification Commands

```bash
# Build
cargo build -p tina-monitor

# Run tests
cargo test -p tina-monitor

# Manual verification
cargo run -p tina-monitor -- --fixture tests/fixtures/sample-orchestration/

# Test overlays:
# Press ? - should show help
# Press q - should close help
# Press / - should show fuzzy finder
# Type and press Enter - should switch orchestration
# Navigate to team member, press Space - should show quicklook
# Press a in quicklook - should attach to tmux
# Press s in quicklook - should open send dialog
```

---

## Dependencies Between Tasks

```
Task 1 (mod.rs) ──────────────┐
                              │
Task 2 (help.rs) ─────────────┤
                              │
Task 3 (quicklook.rs) ────────┼───┐
                              │   │
Task 4 (fuzzy.rs) ────────────┤   │
                              │   │
Task 5 (send.rs) ─────────────┘   │
                                  │
Task 6 (actions.rs) ──────────────┤
                                  │
Task 7 (entity.rs) ───────────────┤
                                  │
Task 8 (panel.rs update) ─────────┤
                                  │
Task 9 (app.rs update) ───────────┴─── Depends on 1-8

Task 10 (panel Space key) ──────────── Depends on 7, 8

Task 11 (tests) ────────────────────── Depends on all above
```

Recommended execution order: 1 → 2, 7, 8 (parallel) → 3, 4, 5, 6 (parallel) → 9 → 10 → 11
