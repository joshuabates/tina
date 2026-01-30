# Phase 7: Agent Interaction

## Overview

This phase adds the ability to send commands to running agents through their tmux panes. This enables operators to send `/checkpoint`, `/clear`, or custom text to agents without leaving the TUI.

## Goals

- Send text/commands to tmux panes
- Safety features: confirmation before sending, command logging
- Quick actions for common commands
- Configurable safety settings

## Prerequisites

From previous phases (already implemented):
- TUI app structure with view state machine (`src/tui/app.rs`)
- Tmux capture module (`src/tmux/capture.rs`, `src/tmux/mod.rs`)
- Config system with SafetyConfig (`src/config.rs`)
- Log viewer for viewing agent output (`src/tui/views/log_viewer.rs`)
- Command modal pattern (`src/tui/views/command_modal.rs`)

## Design Reference

From the design document, phase 7 deliverables:

1. **Send keys module** (`src/tmux/send.rs`)
   - Send text to tmux pane
   - Command logging

2. **Send dialog** (`s` key)
   - Text input field
   - Quick action buttons (1: /checkpoint, 2: /clear)
   - Warning about interruption
   - Confirmation before send

3. **Command logging**
   - Log all sent commands to file
   - Include timestamp, target, command

4. **Safety configuration**
   - `confirm_send` config option
   - `safe_commands` list for quick actions

## Implementation Tasks

### Task 1: Send Keys Module (`src/tmux/send.rs`)

Create the tmux send module to send text to panes.

**File**: `src/tmux/send.rs`

```rust
//! Tmux send keys functionality

use std::process::Command;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SendError {
    #[error("Tmux not found: {0}")]
    TmuxNotFound(String),
    #[error("Send failed: {0}")]
    SendFailed(String),
}

/// Send text to a tmux pane followed by Enter
pub fn send_keys(pane_id: &str, text: &str) -> Result<(), SendError> {
    // Implementation
}

/// Send text to a tmux pane without Enter
pub fn send_keys_raw(pane_id: &str, text: &str) -> Result<(), SendError> {
    // Implementation
}
```

**Tests**:
- `test_send_keys_returns_error_for_invalid_pane`
- `test_send_keys_raw_returns_error_for_invalid_pane`
- `test_send_keys_handles_special_characters`

**Acceptance criteria**:
- Can send text to a valid tmux pane
- Returns appropriate errors for invalid panes
- Handles special characters properly

---

### Task 2: Command Logger (`src/logging.rs`)

Create a logging module for sent commands.

**File**: `src/logging.rs`

```rust
//! Command logging for sent commands

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use chrono::{DateTime, Utc};

pub struct CommandLogger {
    log_path: PathBuf,
}

impl CommandLogger {
    pub fn new(log_path: PathBuf) -> Self;

    /// Expand ~ in path
    fn expand_path(path: &PathBuf) -> PathBuf;

    /// Log a sent command
    pub fn log(&self, target: &str, command: &str) -> anyhow::Result<()>;
}
```

**Tests**:
- `test_log_creates_file_if_not_exists`
- `test_log_appends_to_existing_file`
- `test_log_includes_timestamp_target_command`
- `test_expand_path_handles_tilde`

**Acceptance criteria**:
- Creates log file if it doesn't exist
- Appends to existing log file
- Log entries include timestamp, target pane, command text
- Handles ~ expansion in paths

---

### Task 3: Update tmux/mod.rs

Export the send module and types.

**File**: `src/tmux/mod.rs`

```rust
//! Tmux integration module

pub mod capture;
pub mod send;

pub use capture::{capture_pane, is_tmux_available, pane_exists, CaptureError};
pub use send::{send_keys, send_keys_raw, SendError};
```

**Acceptance criteria**:
- `send_keys` and `send_keys_raw` are re-exported from tmux module

---

### Task 4: Send Dialog View (`src/tui/views/send_dialog.rs`)

Create the send dialog modal view.

**File**: `src/tui/views/send_dialog.rs`

```rust
//! Send dialog for sending commands to agents

pub struct SendDialog {
    /// Text input buffer
    pub input: String,
    /// Pane ID to send to
    pub pane_id: String,
    /// Agent name for display
    pub agent_name: String,
    /// Selected quick action (0 = none, 1 = /checkpoint, 2 = /clear)
    pub quick_action: u8,
    /// Whether confirmation is required
    pub needs_confirmation: bool,
    /// Whether we're in confirmation state
    pub confirming: bool,
}

impl SendDialog {
    pub fn new(pane_id: String, agent_name: String, needs_confirmation: bool) -> Self;

    /// Handle character input
    pub fn handle_char(&mut self, c: char);

    /// Handle backspace
    pub fn handle_backspace(&mut self);

    /// Set quick action (sets input to the quick action text)
    pub fn set_quick_action(&mut self, action: u8);

    /// Get the command text to send
    pub fn get_command(&self) -> &str;

    /// Check if command is a safe command
    pub fn is_safe_command(&self, safe_commands: &[String]) -> bool;
}

/// Render the send dialog
pub fn render(dialog: &SendDialog, frame: &mut Frame, area: Rect);
```

**Tests**:
- `test_new_creates_empty_input`
- `test_handle_char_appends_to_input`
- `test_handle_backspace_removes_last_char`
- `test_set_quick_action_sets_input_text`
- `test_is_safe_command_returns_true_for_configured_commands`
- `test_is_safe_command_returns_false_for_unknown_commands`
- `test_render_shows_input_and_quick_actions`

**Acceptance criteria**:
- Text input works (typing, backspace)
- Quick action buttons work (1, 2 keys)
- Confirmation state when `confirm_send` is true
- Renders warning about interruption

---

### Task 5: Add ViewState::SendDialog

Add the send dialog view state to the app.

**File**: `src/tui/app.rs`

Add to `ViewState` enum:
```rust
/// Send dialog for sending commands to agents
SendDialog {
    /// Pane ID to send to
    pane_id: String,
    /// Agent name for display
    agent_name: String,
},
```

**Tests**:
- `test_view_state_send_dialog_can_be_created`

**Acceptance criteria**:
- `ViewState::SendDialog` variant exists with required fields

---

### Task 6: App State for Send Dialog

Add send dialog state to App struct.

**File**: `src/tui/app.rs`

Add to App struct:
```rust
/// Send dialog instance
pub(crate) send_dialog: Option<super::views::send_dialog::SendDialog>,

/// Command logger instance
pub(crate) command_logger: Option<crate::logging::CommandLogger>,
```

Update `App::new()` to initialize command logger from config.

**Tests**:
- `test_app_initializes_command_logger_from_config`

**Acceptance criteria**:
- App has send_dialog field
- App has command_logger field initialized from config

---

### Task 7: 's' Key Handler in Members Pane

Add 's' key binding to open send dialog when focused on members pane.

**File**: `src/tui/app.rs`

In `handle_phase_detail_key`, add case for `KeyCode::Char('s')` when `focus` is `PaneFocus::Members`:
- Get the selected agent's tmux pane ID
- Create SendDialog instance
- Set view state to `ViewState::SendDialog`

**Tests**:
- `test_s_key_on_members_opens_send_dialog`
- `test_s_key_on_tasks_does_nothing`
- `test_s_key_does_nothing_when_no_orchestrations`

**Acceptance criteria**:
- 's' key opens send dialog when focused on members
- 's' key does nothing when focused on tasks

---

### Task 8: Send Dialog Key Handler

Add key handling for the send dialog.

**File**: `src/tui/app.rs`

Add `handle_send_dialog_key` method:
- Character input: append to input
- Backspace: remove last character
- `1`: set quick action to /checkpoint
- `2`: set quick action to /clear
- Enter: send command (with confirmation if required)
- Esc: close dialog
- `y`: confirm send (when in confirmation state)
- `n`: cancel send (when in confirmation state)

**Tests**:
- `test_character_input_appends_to_send_dialog_input`
- `test_backspace_removes_from_send_dialog_input`
- `test_1_key_sets_checkpoint_quick_action`
- `test_2_key_sets_clear_quick_action`
- `test_enter_sends_command_when_no_confirmation_needed`
- `test_enter_shows_confirmation_when_confirm_send_enabled`
- `test_y_confirms_and_sends`
- `test_n_cancels_confirmation`
- `test_esc_closes_send_dialog`

**Acceptance criteria**:
- All key bindings work correctly
- Confirmation flow works when `confirm_send` is true
- Safe commands bypass confirmation

---

### Task 9: Execute Send Command

Implement the actual send functionality.

**File**: `src/tui/app.rs`

Add `execute_send` method:
1. Get command from send dialog
2. Send to tmux pane using `tmux::send_keys`
3. Log command using `command_logger`
4. Close send dialog
5. Return to previous view (PhaseDetail with Members focus)

**Tests**:
- `test_execute_send_calls_send_keys`
- `test_execute_send_logs_command`
- `test_execute_send_returns_to_phase_detail`

**Acceptance criteria**:
- Command is sent to tmux pane
- Command is logged
- Dialog closes after send

---

### Task 10: Render Send Dialog in UI

Add send dialog rendering to the UI.

**File**: `src/tui/ui.rs`

Add case for `ViewState::SendDialog` in render function:
```rust
ViewState::SendDialog { .. } => {
    if let Some(dialog) = &app.send_dialog {
        send_dialog::render(dialog, frame, area);
    }
}
```

Also update `src/tui/views/mod.rs` to export `send_dialog`.

**Tests**:
- `test_render_shows_send_dialog_when_in_send_dialog_view`

**Acceptance criteria**:
- Send dialog renders correctly
- Shows input field, quick actions, warning, and keybindings

---

### Task 11: Update lib.rs Exports

Export the new logging module.

**File**: `src/lib.rs`

Add:
```rust
pub mod logging;
```

**Acceptance criteria**:
- `logging` module is exported from lib

---

### Task 12: Integration Tests

Add integration tests for the send functionality.

**File**: `tests/send_tests.rs`

Tests:
- `test_send_dialog_flow_opens_and_closes`
- `test_send_dialog_input_and_send`
- `test_quick_actions_work`
- `test_confirmation_flow`
- `test_command_logging_creates_file`

**Acceptance criteria**:
- Full flow works end-to-end
- Commands are logged correctly

---

## Files to Create

1. `src/tmux/send.rs` - Send keys functionality
2. `src/logging.rs` - Command logging
3. `src/tui/views/send_dialog.rs` - Send dialog view
4. `tests/send_tests.rs` - Integration tests

## Files to Modify

1. `src/tmux/mod.rs` - Export send module
2. `src/tui/app.rs` - Add ViewState, App state, key handlers
3. `src/tui/ui.rs` - Render send dialog
4. `src/tui/views/mod.rs` - Export send_dialog module
5. `src/lib.rs` - Export logging module

## Task Dependency Graph

```
Task 1 (send.rs) ─────────────────────────────────┐
                                                  │
Task 2 (logging.rs) ──────────────────────────────┼──> Task 6 (App state)
                                                  │         │
Task 3 (tmux/mod.rs) ─────────────────────────────┤         │
                                                  │         v
Task 4 (send_dialog.rs) ─────────────────────────>├──> Task 7 ('s' key)
                                                  │         │
Task 5 (ViewState) ───────────────────────────────┘         │
                                                            v
                                                      Task 8 (key handler)
                                                            │
                                                            v
                                                      Task 9 (execute send)
                                                            │
                                                            v
Task 11 (lib.rs) ────────────────────────────────────> Task 10 (render)
                                                            │
                                                            v
                                                      Task 12 (integration tests)
```

Parallel execution groups:
- Group A (can run in parallel): Tasks 1, 2, 4, 5
- Group B (depends on A): Tasks 3, 6
- Group C (depends on B): Task 7
- Group D (depends on C): Task 8
- Group E (depends on D): Task 9
- Group F (depends on E): Tasks 10, 11
- Group G (depends on F): Task 12

## Success Criteria

1. Can open send dialog with 's' key when focused on a member
2. Can type text in the input field
3. Quick actions (1, 2) set input to /checkpoint, /clear
4. Enter sends the command to the tmux pane
5. Confirmation is required when `confirm_send` is true (unless safe command)
6. All sent commands are logged to file with timestamp
7. Dialog closes and returns to PhaseDetail after send
8. All tests pass

## Verification Commands

```bash
# Run unit tests
cargo test --lib

# Run integration tests
cargo test --test send_tests

# Run all tests
cargo test

# Check for warnings
cargo clippy

# Verify formatting
cargo fmt --check
```
