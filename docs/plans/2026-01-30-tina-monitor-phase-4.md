# Tina Monitor Phase 4: TUI Detail Views Implementation Plan

## Overview

Phase 4 adds drill-down views for debugging orchestrations, including phase detail view, task inspector modal, and basic log viewer.

## Prerequisites

- Phase 1 complete: Core data model and CLI status command working
- Phase 2 complete: Skill integration with CLI-based monitoring
- Phase 3 complete: Basic TUI with orchestration list, file watching, and navigation

## Goals

1. Phase detail view with split pane showing tasks and team members
2. Task inspector modal with full task details
3. Log viewer modal to capture tmux pane output
4. Navigation between views (expand/collapse, modals)

## Current State Analysis

The existing implementation provides:
- `App` struct with orchestration list, selected index, help modal support
- `OrchestrationStatus` enum with Executing, Blocked, Complete, Idle variants
- `Orchestration` struct with tasks, team_name, cwd, phase info
- `Task` struct with id, subject, description, status, blocks/blockedBy
- File watching for automatic refresh
- Help modal with centered_rect utility

Key files to modify:
- `tina-monitor/src/tui/app.rs` - Add view state machine
- `tina-monitor/src/tui/ui.rs` - Route to different views
- `tina-monitor/src/tui/views/mod.rs` - Register new views

## Tasks

### Task 1: Add View State Machine to App

**Description:** Extend App with a view enum to track which view/modal is active.

**Files to modify:**
- `tina-monitor/src/tui/app.rs`

**Implementation:**

Add a `ViewState` enum to track the current view:
```rust
/// Current view state for the TUI
#[derive(Debug, Clone, PartialEq)]
pub enum ViewState {
    /// Main orchestration list
    OrchestrationList,
    /// Phase detail for selected orchestration
    PhaseDetail {
        /// Focus on tasks (left pane) or members (right pane)
        focus: PaneFocus,
        /// Selected task index
        task_index: usize,
        /// Selected member index
        member_index: usize,
    },
    /// Task inspector modal
    TaskInspector {
        /// Index of the task being inspected
        task_index: usize,
    },
    /// Log viewer modal
    LogViewer {
        /// Index of the agent whose logs to view
        agent_index: usize,
        /// Scroll position in the log
        scroll_offset: usize,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PaneFocus {
    Tasks,
    Members,
}
```

Update `App` struct:
```rust
pub struct App {
    // ... existing fields ...

    /// Current view state
    pub view_state: ViewState,
}
```

Update `handle_key_event` to dispatch based on view state:
```rust
fn handle_key_event(&mut self, key: KeyEvent) {
    // Global keys that work in any view
    match key.code {
        KeyCode::Char('q') => {
            self.should_quit = true;
            return;
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            self.should_quit = true;
            return;
        }
        KeyCode::Char('?') => {
            self.show_help = !self.show_help;
            return;
        }
        KeyCode::Esc if self.show_help => {
            self.show_help = false;
            return;
        }
        _ => {}
    }

    // View-specific key handling
    match &self.view_state {
        ViewState::OrchestrationList => self.handle_orchestration_list_keys(key),
        ViewState::PhaseDetail { .. } => self.handle_phase_detail_keys(key),
        ViewState::TaskInspector { .. } => self.handle_task_inspector_keys(key),
        ViewState::LogViewer { .. } => self.handle_log_viewer_keys(key),
    }
}
```

**Tests:**
- View state transitions work correctly
- Global keys work in all views
- Esc returns to previous view

**Acceptance criteria:**
- App tracks current view state
- Keys dispatch to correct handler based on view

---

### Task 2: Orchestration List Key Handling

**Description:** Implement key handling for the orchestration list view with Enter to expand.

**Files to modify:**
- `tina-monitor/src/tui/app.rs`

**Implementation:**
```rust
fn handle_orchestration_list_keys(&mut self, key: KeyEvent) {
    match key.code {
        KeyCode::Char('j') | KeyCode::Down => self.next(),
        KeyCode::Char('k') | KeyCode::Up => self.previous(),
        KeyCode::Char('r') => {
            let _ = self.refresh();
        }
        KeyCode::Enter => {
            // Expand to phase detail view
            if !self.orchestrations.is_empty() {
                self.view_state = ViewState::PhaseDetail {
                    focus: PaneFocus::Tasks,
                    task_index: 0,
                    member_index: 0,
                };
            }
        }
        KeyCode::Esc => {
            self.should_quit = true;
        }
        _ => {}
    }
}
```

**Tests:**
- Enter transitions to PhaseDetail view
- Enter does nothing when orchestrations list is empty
- j/k navigation still works

**Acceptance criteria:**
- Enter expands selected orchestration to phase detail
- Navigation and refresh continue working

---

### Task 3: Phase Detail View Rendering

**Description:** Create the phase detail view with split pane layout showing tasks and team members.

**Files to create:**
- `tina-monitor/src/tui/views/phase_detail.rs`

**Files to modify:**
- `tina-monitor/src/tui/views/mod.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/views/phase_detail.rs
//! Phase detail view showing tasks and team members

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, ListState, Paragraph},
    Frame,
};

use crate::data::discovery::Orchestration;
use crate::data::types::{Task, TaskStatus};
use crate::tui::app::{App, PaneFocus, ViewState};
use crate::tui::widgets::progress_bar;

/// Render the phase detail view
pub fn render(frame: &mut Frame, area: Rect, app: &App) {
    let orchestration = match app.orchestrations.get(app.selected_index) {
        Some(o) => o,
        None => return,
    };

    let (focus, task_index, member_index) = match &app.view_state {
        ViewState::PhaseDetail { focus, task_index, member_index } => (*focus, *task_index, *member_index),
        _ => return,
    };

    // Layout: header + split pane
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Header
            Constraint::Min(0),     // Content
        ])
        .split(area);

    render_header(frame, chunks[0], orchestration);

    // Split content into tasks (left) and team (right)
    let content_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(60),  // Tasks
            Constraint::Percentage(40),  // Team
        ])
        .split(chunks[1]);

    render_tasks_pane(frame, content_chunks[0], orchestration, task_index, focus == PaneFocus::Tasks);
    render_team_pane(frame, content_chunks[1], orchestration, member_index, focus == PaneFocus::Members);
}

fn render_header(frame: &mut Frame, area: Rect, orchestration: &Orchestration) {
    let title = format!(
        "{} > Phase {} ({})",
        orchestration.title,
        orchestration.current_phase,
        match &orchestration.status {
            crate::data::discovery::OrchestrationStatus::Executing { .. } => "executing",
            crate::data::discovery::OrchestrationStatus::Blocked { .. } => "blocked",
            crate::data::discovery::OrchestrationStatus::Complete => "complete",
            crate::data::discovery::OrchestrationStatus::Idle => "idle",
        }
    );

    let header = Paragraph::new(title)
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(Block::default().borders(Borders::BOTTOM));

    frame.render_widget(header, area);
}

fn render_tasks_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &Orchestration,
    selected_index: usize,
    is_focused: bool,
) {
    let items: Vec<ListItem> = orchestration
        .tasks
        .iter()
        .map(|task| {
            let status_char = match task.status {
                TaskStatus::Completed => Span::styled("✓", Style::default().fg(Color::Green)),
                TaskStatus::InProgress => Span::styled("▶", Style::default().fg(Color::Yellow)),
                TaskStatus::Pending if !task.blocked_by.is_empty() => {
                    Span::styled("✗", Style::default().fg(Color::Red))
                }
                TaskStatus::Pending => Span::styled("○", Style::default().fg(Color::DarkGray)),
            };

            let owner = task.owner.as_deref().unwrap_or("-");

            let line = Line::from(vec![
                status_char,
                Span::raw(" "),
                Span::styled(
                    format!("{}. ", task.id),
                    Style::default().fg(Color::DarkGray),
                ),
                Span::raw(truncate(&task.subject, 35)),
                Span::raw("  "),
                Span::styled(owner, Style::default().fg(Color::Cyan)),
            ]);

            ListItem::new(line)
        })
        .collect();

    let border_style = if is_focused {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Tasks ")
                .border_style(border_style),
        )
        .highlight_style(
            Style::default()
                .add_modifier(Modifier::BOLD)
                .add_modifier(Modifier::REVERSED),
        )
        .highlight_symbol("> ");

    let mut state = ListState::default();
    if !orchestration.tasks.is_empty() {
        state.select(Some(selected_index.min(orchestration.tasks.len().saturating_sub(1))));
    }

    frame.render_stateful_widget(list, area, &mut state);
}

fn render_team_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &Orchestration,
    selected_index: usize,
    is_focused: bool,
) {
    // For now, show placeholder until we load team data
    // In a real implementation, we'd load the team from the orchestration
    let border_style = if is_focused {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };

    let context_bar = orchestration.context_percent
        .map(|pct| format!("ctx: {}% {}", pct, progress_bar::render(pct as usize, 100, 15)))
        .unwrap_or_else(|| "ctx: --".to_string());

    let content = vec![
        Line::from("Team members:"),
        Line::from("  (team loading not yet implemented)"),
        Line::from(""),
        Line::from(context_bar),
    ];

    let paragraph = Paragraph::new(content)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Team ")
                .border_style(border_style),
        );

    frame.render_widget(paragraph, area);
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::discovery::OrchestrationStatus;
    use std::path::PathBuf;

    fn make_test_task(id: &str, status: TaskStatus) -> Task {
        Task {
            id: id.to_string(),
            subject: format!("Task {}", id),
            description: "Description".to_string(),
            active_form: None,
            status,
            owner: Some("worker".to_string()),
            blocks: vec![],
            blocked_by: vec![],
            metadata: serde_json::Value::Null,
        }
    }

    fn make_test_orchestration() -> Orchestration {
        Orchestration {
            team_name: "test-orchestration".to_string(),
            title: "Test Project".to_string(),
            cwd: PathBuf::from("/test"),
            current_phase: 2,
            total_phases: 3,
            design_doc_path: PathBuf::from("/test/design.md"),
            context_percent: Some(45),
            status: OrchestrationStatus::Executing { phase: 2 },
            tasks: vec![
                make_test_task("1", TaskStatus::Completed),
                make_test_task("2", TaskStatus::InProgress),
                make_test_task("3", TaskStatus::Pending),
            ],
        }
    }

    #[test]
    fn test_truncate_short_string() {
        assert_eq!(truncate("short", 10), "short");
    }

    #[test]
    fn test_truncate_long_string() {
        assert_eq!(truncate("this is a long string", 10), "this is...");
    }

    #[test]
    fn test_truncate_exact_length() {
        assert_eq!(truncate("exactly10!", 10), "exactly10!");
    }
}
```

Update views mod.rs:
```rust
pub mod help;
pub mod orchestration_list;
pub mod phase_detail;
```

**Tests:**
- Tasks pane renders all tasks with correct status indicators
- Team pane renders context percentage
- Focused pane has highlighted border
- truncate function works correctly

**Acceptance criteria:**
- Phase detail shows tasks on left, team on right
- Task status indicators: ✓ completed, ▶ in_progress, ○ pending, ✗ blocked
- Context usage bar displays

---

### Task 4: Phase Detail Key Handling

**Description:** Implement key handling for phase detail view with pane switching and navigation.

**Files to modify:**
- `tina-monitor/src/tui/app.rs`

**Implementation:**
```rust
fn handle_phase_detail_keys(&mut self, key: KeyEvent) {
    let orchestration = match self.orchestrations.get(self.selected_index) {
        Some(o) => o,
        None => {
            self.view_state = ViewState::OrchestrationList;
            return;
        }
    };

    let (focus, task_index, member_index) = match &self.view_state {
        ViewState::PhaseDetail { focus, task_index, member_index } =>
            (*focus, *task_index, *member_index),
        _ => return,
    };

    match key.code {
        // Pane switching
        KeyCode::Char('t') | KeyCode::Left => {
            self.view_state = ViewState::PhaseDetail {
                focus: PaneFocus::Tasks,
                task_index,
                member_index,
            };
        }
        KeyCode::Char('m') | KeyCode::Right => {
            self.view_state = ViewState::PhaseDetail {
                focus: PaneFocus::Members,
                task_index,
                member_index,
            };
        }
        // Navigation within focused pane
        KeyCode::Char('j') | KeyCode::Down => {
            match focus {
                PaneFocus::Tasks => {
                    let new_index = if orchestration.tasks.is_empty() {
                        0
                    } else {
                        (task_index + 1) % orchestration.tasks.len()
                    };
                    self.view_state = ViewState::PhaseDetail {
                        focus,
                        task_index: new_index,
                        member_index,
                    };
                }
                PaneFocus::Members => {
                    // TODO: member navigation when team loading implemented
                }
            }
        }
        KeyCode::Char('k') | KeyCode::Up => {
            match focus {
                PaneFocus::Tasks => {
                    let new_index = if orchestration.tasks.is_empty() {
                        0
                    } else if task_index == 0 {
                        orchestration.tasks.len() - 1
                    } else {
                        task_index - 1
                    };
                    self.view_state = ViewState::PhaseDetail {
                        focus,
                        task_index: new_index,
                        member_index,
                    };
                }
                PaneFocus::Members => {
                    // TODO: member navigation when team loading implemented
                }
            }
        }
        // Open task inspector
        KeyCode::Enter if focus == PaneFocus::Tasks => {
            if !orchestration.tasks.is_empty() {
                self.view_state = ViewState::TaskInspector { task_index };
            }
        }
        // View logs (l key on member)
        KeyCode::Char('l') if focus == PaneFocus::Members => {
            self.view_state = ViewState::LogViewer {
                agent_index: member_index,
                scroll_offset: 0,
            };
        }
        // Return to orchestration list
        KeyCode::Esc => {
            self.view_state = ViewState::OrchestrationList;
        }
        // Refresh
        KeyCode::Char('r') => {
            let _ = self.refresh();
        }
        _ => {}
    }
}
```

**Tests:**
- `t` and `m` switch pane focus
- `j`/`k` navigate within focused pane
- Enter on task opens task inspector
- Esc returns to orchestration list

**Acceptance criteria:**
- Can switch focus between tasks and members
- Can navigate tasks with j/k
- Enter opens task inspector modal
- Esc returns to orchestration list

---

### Task 5: Task Inspector Modal

**Description:** Create modal view showing full task details.

**Files to create:**
- `tina-monitor/src/tui/views/task_inspector.rs`

**Files to modify:**
- `tina-monitor/src/tui/views/mod.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/views/task_inspector.rs
//! Task inspector modal showing full task details

use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};

use crate::data::types::{Task, TaskStatus};
use crate::tui::app::{App, ViewState};

/// Render the task inspector modal
pub fn render(frame: &mut Frame, app: &App) {
    let task_index = match &app.view_state {
        ViewState::TaskInspector { task_index } => *task_index,
        _ => return,
    };

    let orchestration = match app.orchestrations.get(app.selected_index) {
        Some(o) => o,
        None => return,
    };

    let task = match orchestration.tasks.get(task_index) {
        Some(t) => t,
        None => return,
    };

    let area = centered_rect(70, 70, frame.area());

    // Clear the area first
    frame.render_widget(Clear, area);

    let status_str = match task.status {
        TaskStatus::Completed => "completed",
        TaskStatus::InProgress => "in_progress",
        TaskStatus::Pending => "pending",
    };

    let status_color = match task.status {
        TaskStatus::Completed => Color::Green,
        TaskStatus::InProgress => Color::Yellow,
        TaskStatus::Pending => Color::DarkGray,
    };

    let owner_str = task.owner.as_deref().unwrap_or("(unassigned)");

    let blocks_str = if task.blocks.is_empty() {
        "(none)".to_string()
    } else {
        task.blocks.join(", ")
    };

    let blocked_by_str = if task.blocked_by.is_empty() {
        "(none)".to_string()
    } else {
        task.blocked_by.join(", ")
    };

    let mut content = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("Status: ", Style::default().add_modifier(Modifier::BOLD)),
            Span::styled(status_str, Style::default().fg(status_color)),
        ]),
        Line::from(vec![
            Span::styled("Owner: ", Style::default().add_modifier(Modifier::BOLD)),
            Span::raw(owner_str),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Description:", Style::default().add_modifier(Modifier::BOLD)),
        ]),
    ];

    // Add description lines (wrap manually)
    for line in task.description.lines() {
        content.push(Line::from(format!("  {}", line)));
    }

    content.push(Line::from(""));
    content.push(Line::from(vec![
        Span::styled("Blocked by: ", Style::default().add_modifier(Modifier::BOLD)),
        Span::raw(blocked_by_str),
    ]));
    content.push(Line::from(vec![
        Span::styled("Blocks: ", Style::default().add_modifier(Modifier::BOLD)),
        Span::raw(blocks_str),
    ]));

    // Add metadata if present
    if !task.metadata.is_null() && task.metadata.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        content.push(Line::from(""));
        content.push(Line::from(vec![
            Span::styled("Metadata:", Style::default().add_modifier(Modifier::BOLD)),
        ]));

        if let Some(obj) = task.metadata.as_object() {
            for (key, value) in obj {
                let value_str = match value {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                content.push(Line::from(format!("  {}: {}", key, value_str)));
            }
        }
    }

    content.push(Line::from(""));
    content.push(Line::from(vec![
        Span::styled("                                        ", Style::default()),
        Span::styled("[ESC] Close", Style::default().fg(Color::DarkGray)),
    ]));

    let title = format!(" Task: {} ", truncate(&task.subject, 50));

    let paragraph = Paragraph::new(content)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .title_alignment(Alignment::Left),
        )
        .wrap(Wrap { trim: false });

    frame.render_widget(paragraph, area);
}

fn truncate(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    } else {
        s.to_string()
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use ratatui::{backend::TestBackend, Terminal};

    #[test]
    fn test_centered_rect() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };

        let result = centered_rect(70, 70, area);
        assert_eq!(result.x, 15);
        assert_eq!(result.y, 15);
        assert_eq!(result.width, 70);
        assert_eq!(result.height, 70);
    }

    #[test]
    fn test_truncate() {
        assert_eq!(truncate("short", 10), "short");
        assert_eq!(truncate("this is too long", 10), "this is...");
    }
}
```

**Tests:**
- Modal renders without panic
- Task details display correctly
- Metadata section only shows when metadata exists

**Acceptance criteria:**
- Modal shows task subject, status, owner, description
- Shows blocked by and blocks relationships
- Shows metadata when present
- [ESC] Close hint displayed

---

### Task 6: Task Inspector Key Handling

**Description:** Implement key handling for task inspector modal.

**Files to modify:**
- `tina-monitor/src/tui/app.rs`

**Implementation:**
```rust
fn handle_task_inspector_keys(&mut self, key: KeyEvent) {
    match key.code {
        // Close modal and return to phase detail
        KeyCode::Esc | KeyCode::Enter => {
            // Get the task_index before transitioning
            let task_index = match &self.view_state {
                ViewState::TaskInspector { task_index } => *task_index,
                _ => 0,
            };
            self.view_state = ViewState::PhaseDetail {
                focus: PaneFocus::Tasks,
                task_index,
                member_index: 0,
            };
        }
        // Refresh
        KeyCode::Char('r') => {
            let _ = self.refresh();
        }
        _ => {}
    }
}
```

**Tests:**
- Esc closes task inspector and returns to phase detail
- Enter also closes task inspector
- Previous task selection is preserved

**Acceptance criteria:**
- Esc returns to phase detail view
- Task selection preserved when returning

---

### Task 7: Tmux Capture Module

**Description:** Create module for capturing tmux pane output.

**Files to create:**
- `tina-monitor/src/tmux/mod.rs`
- `tina-monitor/src/tmux/capture.rs`

**Files to modify:**
- `tina-monitor/src/lib.rs` (add tmux module)

**Implementation:**
```rust
// tina-monitor/src/tmux/mod.rs
//! Tmux interaction utilities

pub mod capture;
```

```rust
// tina-monitor/src/tmux/capture.rs
//! Capture output from tmux panes

use std::process::Command;

/// Capture the last N lines from a tmux pane
pub fn capture_pane(pane_id: &str, lines: usize) -> Result<String, CaptureError> {
    // tmux capture-pane -t <pane_id> -p -S -<lines>
    let output = Command::new("tmux")
        .args([
            "capture-pane",
            "-t",
            pane_id,
            "-p",
            "-S",
            &format!("-{}", lines),
        ])
        .output()
        .map_err(|e| CaptureError::TmuxNotFound(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(CaptureError::CaptureFailed(stderr.to_string()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Check if tmux is available
pub fn is_tmux_available() -> bool {
    Command::new("tmux")
        .arg("-V")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if a pane exists
pub fn pane_exists(pane_id: &str) -> bool {
    Command::new("tmux")
        .args(["display-message", "-t", pane_id, "-p", "#{pane_id}"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[derive(Debug, thiserror::Error)]
pub enum CaptureError {
    #[error("tmux not found: {0}")]
    TmuxNotFound(String),
    #[error("capture failed: {0}")]
    CaptureFailed(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_tmux_available_returns_bool() {
        // Just verify it doesn't panic
        let _ = is_tmux_available();
    }

    #[test]
    fn test_capture_pane_invalid_id() {
        // Should return error for invalid pane
        let result = capture_pane("nonexistent-pane-12345", 10);
        assert!(result.is_err());
    }
}
```

**Tests:**
- `is_tmux_available` returns boolean without panicking
- `capture_pane` with invalid pane ID returns error
- `pane_exists` returns false for nonexistent panes

**Acceptance criteria:**
- Can capture output from valid tmux panes
- Graceful error handling when tmux not available
- Graceful error handling for invalid pane IDs

---

### Task 8: Log Viewer Modal

**Description:** Create modal view for viewing agent logs from tmux pane.

**Files to create:**
- `tina-monitor/src/tui/views/log_viewer.rs`

**Files to modify:**
- `tina-monitor/src/tui/views/mod.rs`

**Implementation:**
```rust
// tina-monitor/src/tui/views/log_viewer.rs
//! Log viewer modal showing tmux pane output

use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph, Wrap},
    Frame,
};

use crate::tmux::capture;
use crate::tui::app::{App, ViewState};

const LOG_LINES: usize = 100;

/// Render the log viewer modal
pub fn render(frame: &mut Frame, app: &App) {
    let (agent_index, scroll_offset) = match &app.view_state {
        ViewState::LogViewer { agent_index, scroll_offset } => (*agent_index, *scroll_offset),
        _ => return,
    };

    let area = centered_rect(85, 85, frame.area());

    // Clear the area first
    frame.render_widget(Clear, area);

    // For now, show placeholder since team loading isn't implemented
    // In a real implementation, we'd get the tmux pane ID from the agent
    let content = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("Log Viewer", Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from(""),
        Line::from("Agent log viewing requires team data to be loaded."),
        Line::from(""),
        Line::from("Once implemented, this will show:"),
        Line::from("  - Real-time output from the agent's tmux pane"),
        Line::from("  - Scrollable history with j/k"),
        Line::from("  - Follow mode with 'f' key"),
        Line::from(""),
        Line::from(vec![
            Span::styled("Scroll: ", Style::default().fg(Color::DarkGray)),
            Span::raw(format!("offset {}", scroll_offset)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("[j/k] Scroll  [f] Follow  [a] Attach  [ESC] Close",
                Style::default().fg(Color::DarkGray)),
        ]),
    ];

    let title = format!(" Logs: agent {} ", agent_index);

    let paragraph = Paragraph::new(content)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .title_alignment(Alignment::Left),
        )
        .wrap(Wrap { trim: false });

    frame.render_widget(paragraph, area);
}

/// Render log viewer with actual pane content
pub fn render_with_pane(frame: &mut Frame, pane_id: &str, agent_name: &str, scroll_offset: usize) {
    let area = centered_rect(85, 85, frame.area());

    frame.render_widget(Clear, area);

    let log_content = match capture::capture_pane(pane_id, LOG_LINES) {
        Ok(content) => content,
        Err(e) => format!("Error capturing pane: {}", e),
    };

    let lines: Vec<Line> = log_content
        .lines()
        .skip(scroll_offset)
        .map(|l| Line::from(l.to_string()))
        .collect();

    let title = format!(" Logs: {} ", agent_name);

    let paragraph = Paragraph::new(lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(title)
                .title_alignment(Alignment::Left),
        )
        .wrap(Wrap { trim: false });

    frame.render_widget(paragraph, area);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_centered_rect() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 100,
            height: 100,
        };

        let result = centered_rect(85, 85, area);
        assert!(result.width > 80);
        assert!(result.height > 80);
    }
}
```

Update views mod.rs:
```rust
pub mod help;
pub mod log_viewer;
pub mod orchestration_list;
pub mod phase_detail;
pub mod task_inspector;
```

**Tests:**
- Log viewer renders placeholder when team not loaded
- centered_rect produces reasonable dimensions

**Acceptance criteria:**
- Modal shows placeholder explaining feature
- Shows keybinding hints
- Structure ready for real log capture

---

### Task 9: Log Viewer Key Handling

**Description:** Implement key handling for log viewer modal.

**Files to modify:**
- `tina-monitor/src/tui/app.rs`

**Implementation:**
```rust
fn handle_log_viewer_keys(&mut self, key: KeyEvent) {
    let (agent_index, scroll_offset) = match &self.view_state {
        ViewState::LogViewer { agent_index, scroll_offset } => (*agent_index, *scroll_offset),
        _ => return,
    };

    match key.code {
        // Scroll down
        KeyCode::Char('j') | KeyCode::Down => {
            self.view_state = ViewState::LogViewer {
                agent_index,
                scroll_offset: scroll_offset + 1,
            };
        }
        // Scroll up
        KeyCode::Char('k') | KeyCode::Up => {
            self.view_state = ViewState::LogViewer {
                agent_index,
                scroll_offset: scroll_offset.saturating_sub(1),
            };
        }
        // Page down
        KeyCode::PageDown | KeyCode::Char('d') => {
            self.view_state = ViewState::LogViewer {
                agent_index,
                scroll_offset: scroll_offset + 20,
            };
        }
        // Page up
        KeyCode::PageUp | KeyCode::Char('u') => {
            self.view_state = ViewState::LogViewer {
                agent_index,
                scroll_offset: scroll_offset.saturating_sub(20),
            };
        }
        // Close and return to phase detail
        KeyCode::Esc => {
            self.view_state = ViewState::PhaseDetail {
                focus: PaneFocus::Members,
                task_index: 0,
                member_index: agent_index,
            };
        }
        // Refresh
        KeyCode::Char('r') => {
            let _ = self.refresh();
        }
        _ => {}
    }
}
```

**Tests:**
- j/k scroll up and down
- d/u page up and down
- Esc returns to phase detail with members focus

**Acceptance criteria:**
- Can scroll through logs
- Scroll offset cannot go negative
- Esc returns to phase detail

---

### Task 10: Update UI Render to Handle All Views

**Description:** Update the main render function to route to the appropriate view.

**Files to modify:**
- `tina-monitor/src/tui/ui.rs`

**Implementation:**
```rust
use super::views::{help, log_viewer, orchestration_list, phase_detail, task_inspector};

/// Render the application UI
pub fn render(frame: &mut Frame, app: &App) {
    match &app.view_state {
        ViewState::OrchestrationList => {
            render_orchestration_list_layout(frame, app);
        }
        ViewState::PhaseDetail { .. } => {
            render_phase_detail_layout(frame, app);
        }
        ViewState::TaskInspector { .. } => {
            // Render phase detail in background, then modal on top
            render_phase_detail_layout(frame, app);
            task_inspector::render(frame, app);
        }
        ViewState::LogViewer { .. } => {
            // Render phase detail in background, then modal on top
            render_phase_detail_layout(frame, app);
            log_viewer::render(frame, app);
        }
    }

    // Help modal renders on top of everything
    if app.show_help {
        help::render_help(frame);
    }
}

fn render_orchestration_list_layout(frame: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Header
            Constraint::Min(0),     // Main content
            Constraint::Length(1),  // Footer
        ])
        .split(frame.area());

    render_header(frame, chunks[0], "Orchestrations");
    orchestration_list::render_orchestration_list(frame, chunks[1], app);
    render_footer(frame, chunks[2], " j/k:nav  Enter:expand  r:refresh  q:quit  ?:help");
}

fn render_phase_detail_layout(frame: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(0),     // Main content (includes its own header)
            Constraint::Length(1),  // Footer
        ])
        .split(frame.area());

    phase_detail::render(frame, chunks[0], app);
    render_footer(frame, chunks[1], " t:tasks  m:members  Enter:inspect  l:logs  Esc:back  ?:help");
}

fn render_header(frame: &mut Frame, area: Rect, title: &str) {
    let header = Paragraph::new(title)
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(Block::default().borders(Borders::BOTTOM));
    frame.render_widget(header, area);
}

fn render_footer(frame: &mut Frame, area: Rect, text: &str) {
    let footer = Paragraph::new(text)
        .style(Style::default().fg(Color::DarkGray));
    frame.render_widget(footer, area);
}
```

**Tests:**
- All view states render without panic
- Help modal renders on top of any view
- Modals render over phase detail background

**Acceptance criteria:**
- Correct view renders based on view_state
- Modals render on top of phase detail
- Help modal always on top
- Footer hints change per view

---

### Task 11: Update Help Modal

**Description:** Update help modal to show all keybindings including new views.

**Files to modify:**
- `tina-monitor/src/tui/views/help.rs`

**Implementation:**

Update help text to include new keybindings:
```rust
let help_text = vec![
    Line::from(vec![
        Span::styled("Orchestration List", Style::default().add_modifier(Modifier::BOLD)),
    ]),
    Line::from(""),
    Line::from("  j / k        Navigate up/down"),
    Line::from("  Enter        Expand orchestration details"),
    Line::from("  r            Refresh data"),
    Line::from(""),
    Line::from(vec![
        Span::styled("Phase Detail", Style::default().add_modifier(Modifier::BOLD)),
    ]),
    Line::from(""),
    Line::from("  t / Left     Focus tasks pane"),
    Line::from("  m / Right    Focus team members pane"),
    Line::from("  j / k        Navigate within focused pane"),
    Line::from("  Enter        Open task inspector (when task focused)"),
    Line::from("  l            View agent logs (when member focused)"),
    Line::from("  Esc          Return to orchestration list"),
    Line::from(""),
    Line::from(vec![
        Span::styled("Task Inspector", Style::default().add_modifier(Modifier::BOLD)),
    ]),
    Line::from(""),
    Line::from("  Esc / Enter  Close inspector"),
    Line::from(""),
    Line::from(vec![
        Span::styled("Log Viewer", Style::default().add_modifier(Modifier::BOLD)),
    ]),
    Line::from(""),
    Line::from("  j / k        Scroll up/down"),
    Line::from("  d / u        Page down/up"),
    Line::from("  Esc          Close log viewer"),
    Line::from(""),
    Line::from(vec![
        Span::styled("Global", Style::default().add_modifier(Modifier::BOLD)),
    ]),
    Line::from(""),
    Line::from("  ?            Toggle this help"),
    Line::from("  q / Ctrl+C   Quit"),
];
```

**Tests:**
- Help modal renders all sections
- Help modal fits in reasonable terminal sizes

**Acceptance criteria:**
- Help shows keybindings for all views
- Organized by view/context

---

### Task 12: Integration Testing

**Description:** Create tests for view transitions and rendering.

**Files to modify:**
- `tina-monitor/tests/tui_tests.rs`

**Implementation:**
```rust
use std::path::PathBuf;
use std::time::{Duration, Instant};

use tina_monitor::data::discovery::{Orchestration, OrchestrationStatus};
use tina_monitor::data::types::{Task, TaskStatus};
use tina_monitor::tui::app::{App, PaneFocus, ViewState};

fn make_test_task(id: &str, status: TaskStatus) -> Task {
    Task {
        id: id.to_string(),
        subject: format!("Task {}", id),
        description: "Test description".to_string(),
        active_form: None,
        status,
        owner: Some("worker".to_string()),
        blocks: vec![],
        blocked_by: vec![],
        metadata: serde_json::Value::Null,
    }
}

fn make_test_orchestration() -> Orchestration {
    Orchestration {
        team_name: "test-orchestration".to_string(),
        title: "Test Project".to_string(),
        cwd: PathBuf::from("/test"),
        current_phase: 2,
        total_phases: 3,
        design_doc_path: PathBuf::from("/test/design.md"),
        context_percent: Some(45),
        status: OrchestrationStatus::Executing { phase: 2 },
        tasks: vec![
            make_test_task("1", TaskStatus::Completed),
            make_test_task("2", TaskStatus::InProgress),
            make_test_task("3", TaskStatus::Pending),
        ],
    }
}

#[test]
fn test_view_state_transitions() {
    let orchestrations = vec![make_test_orchestration()];
    let app = App::new_with_orchestrations(orchestrations);

    assert!(matches!(app.view_state, ViewState::OrchestrationList));
}

#[test]
fn test_enter_expands_to_phase_detail() {
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

    let orchestrations = vec![make_test_orchestration()];
    let mut app = App::new_with_orchestrations(orchestrations);

    // Simulate Enter key
    let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
    app.handle_key_event_for_test(key);

    assert!(matches!(app.view_state, ViewState::PhaseDetail { .. }));
}

#[test]
fn test_esc_returns_to_orchestration_list() {
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

    let orchestrations = vec![make_test_orchestration()];
    let mut app = App::new_with_orchestrations(orchestrations);

    // Go to phase detail
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
    };

    // Simulate Esc key
    let key = KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE);
    app.handle_key_event_for_test(key);

    assert!(matches!(app.view_state, ViewState::OrchestrationList));
}

#[test]
fn test_enter_opens_task_inspector() {
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

    let orchestrations = vec![make_test_orchestration()];
    let mut app = App::new_with_orchestrations(orchestrations);

    // Go to phase detail with tasks focus
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 1,
        member_index: 0,
    };

    // Simulate Enter key
    let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
    app.handle_key_event_for_test(key);

    assert!(matches!(app.view_state, ViewState::TaskInspector { task_index: 1 }));
}

#[test]
fn test_pane_focus_switches() {
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

    let orchestrations = vec![make_test_orchestration()];
    let mut app = App::new_with_orchestrations(orchestrations);

    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 0,
        member_index: 0,
    };

    // Switch to members with 'm' key
    let key = KeyEvent::new(KeyCode::Char('m'), KeyModifiers::NONE);
    app.handle_key_event_for_test(key);

    match app.view_state {
        ViewState::PhaseDetail { focus, .. } => {
            assert_eq!(focus, PaneFocus::Members);
        }
        _ => panic!("Expected PhaseDetail view"),
    }
}
```

Note: This requires adding a public `handle_key_event_for_test` method to App for testing purposes.

**Tests:**
- View state transitions work correctly
- All key handlers function properly
- Empty orchestration list is handled gracefully

**Acceptance criteria:**
- All view transitions tested
- No panics on edge cases

---

## Dependencies

Task dependencies:
1. Task 1 (view state) - required for all others
2. Tasks 2, 4, 6, 9 (key handlers) depend on Task 1
3. Task 3 (phase detail view) depends on Task 1
4. Task 5 (task inspector) depends on Task 3
5. Task 7 (tmux capture) is independent
6. Task 8 (log viewer) depends on Task 7
7. Task 10 (UI routing) depends on Tasks 3, 5, 8
8. Task 11 (help update) depends on knowing all keybindings
9. Task 12 (integration tests) depends on all features

Parallel work possible:
- Task 7 (tmux) can be done in parallel with Tasks 3-6
- Tasks 3, 5, 8 (view rendering) can be done in parallel once Task 1 done

## Files Summary

**Create:**
- `tina-monitor/src/tui/views/phase_detail.rs`
- `tina-monitor/src/tui/views/task_inspector.rs`
- `tina-monitor/src/tui/views/log_viewer.rs`
- `tina-monitor/src/tmux/mod.rs`
- `tina-monitor/src/tmux/capture.rs`

**Modify:**
- `tina-monitor/src/tui/app.rs` - Add ViewState, PaneFocus, key handlers
- `tina-monitor/src/tui/ui.rs` - Route to different views
- `tina-monitor/src/tui/views/mod.rs` - Register new views
- `tina-monitor/src/tui/views/help.rs` - Update keybinding list
- `tina-monitor/src/lib.rs` - Add tmux module
- `tina-monitor/tests/tui_tests.rs` - Add integration tests

## Testing Strategy

1. **Unit tests** for each new module:
   - ViewState transitions
   - Key handler logic
   - Tmux capture error handling

2. **Render tests** using TestBackend:
   - Each view renders without panic
   - Modals render on top of background

3. **Integration tests**:
   - Full key sequence to navigate views
   - State preservation across transitions

## Success Criteria

1. Enter on orchestration expands to phase detail view
2. Phase detail shows tasks on left, team on right
3. t/m keys switch focus between panes
4. Enter on task opens task inspector modal
5. l key (on member focus) opens log viewer modal
6. Esc key navigates back through view hierarchy
7. Help modal shows all keybindings for all views
8. No panics on any view with empty data
