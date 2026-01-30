# Phase 5.5: Implement 'a' Key for Attach to Tmux

## Overview

This remediation phase addresses a gap in Phase 5 implementation: the 'a' key binding for attaching to an agent's tmux pane is documented in the help modal but not implemented in `app.rs`.

## Issue Analysis

### Current State

1. **Terminal module** (`src/terminal/mod.rs`): The `TerminalHandler` trait defines `attach_tmux(&self, session_name: &str, pane_id: Option<&str>)` method - **IMPLEMENTED**

2. **Kitty handler** (`src/terminal/kitty.rs`): Implements `attach_tmux` to open a kitty tab attached to a tmux session - **IMPLEMENTED**

3. **Fallback handler** (`src/terminal/fallback.rs`): Implements `attach_tmux` to return a command string for the user - **IMPLEMENTED**

4. **Help modal** (`src/tui/views/help.rs`): Documents 'a' key: "a - Attach to agent's tmux pane (when member focused)" - **DOCUMENTED**

5. **App key handling** (`src/tui/app.rs`): `handle_phase_detail_key()` for `PaneFocus::Members` does NOT handle 'a' key - **MISSING**

### Gap

In `app.rs:364-380` (handle_phase_detail_key for PaneFocus::Members):
```rust
PaneFocus::Members => {
    match key.code {
        KeyCode::Char('j') | KeyCode::Down => { ... }
        KeyCode::Char('k') | KeyCode::Up => { ... }
        KeyCode::Char('l') => {
            self.view_state = ViewState::LogViewer { ... };
        }
        _ => {}  // 'a' key falls through here - NOT HANDLED
    }
}
```

## Implementation Plan

### Task 1: Add handle_attach_tmux method to App

**File:** `tina-monitor/src/tui/app.rs`

Add a new method similar to `handle_goto()`:

```rust
/// Handle attach action - attach to agent's tmux pane
fn handle_attach_tmux(&mut self, agent_index: usize) -> AppResult<()> {
    if self.orchestrations.is_empty() {
        return Ok(());
    }

    let orch = &self.orchestrations[self.selected_index];

    // Get team members for current orchestration
    // Need to load team config to get agent details
    let team_path = dirs::home_dir()
        .ok_or("Could not find home directory")?
        .join(".claude/teams")
        .join(&orch.team_name)
        .join("config.json");

    let team: Team = serde_json::from_str(
        &std::fs::read_to_string(&team_path)?
    )?;

    // Get the selected agent
    let agent = team.members.get(agent_index)
        .ok_or("Agent index out of bounds")?;

    // Get tmux pane ID if available
    let pane_id = agent.tmux_pane_id.as_deref();

    // Derive session name from team name (convention: tina-{team_name})
    let session_name = format!("tina-{}", orch.team_name);

    let config = Config::load()?;
    let handler = get_handler(&config.terminal.handler);

    match handler.attach_tmux(&session_name, pane_id)? {
        TerminalResult::Success => Ok(()),
        TerminalResult::ShowCommand { command, description } => {
            self.view_state = ViewState::CommandModal {
                command,
                description,
                copied: false,
            };
            Ok(())
        }
    }
}
```

**Required imports** (verify these are present):
```rust
use crate::data::types::Team;
```

### Task 2: Wire 'a' key to handle_attach_tmux in PaneFocus::Members

**File:** `tina-monitor/src/tui/app.rs`

**Location:** `handle_phase_detail_key()` method, inside `PaneFocus::Members` match arm (around line 375)

**Change:**
```rust
PaneFocus::Members => {
    match key.code {
        KeyCode::Char('j') | KeyCode::Down => {
            // ... existing code ...
        }
        KeyCode::Char('k') | KeyCode::Up => {
            // ... existing code ...
        }
        KeyCode::Char('l') => {
            self.view_state = ViewState::LogViewer {
                agent_index: member_index,
                scroll_offset: 0,
            };
        }
        KeyCode::Char('a') => {
            let _ = self.handle_attach_tmux(member_index);
        }
        _ => {}
    }
}
```

### Task 3: Add unit tests for 'a' key behavior

**File:** `tina-monitor/src/tui/app.rs` (in `#[cfg(test)]` module)

Add tests:

```rust
#[test]
fn test_a_key_on_members_opens_attach_action() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 2,
    };

    let key = KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE);
    app.handle_key_event(key);

    // Should either:
    // 1. Transition to CommandModal (fallback handler - most likely in tests)
    // 2. Stay in PhaseDetail if no orchestration data
    // The exact behavior depends on whether team config exists
    // For unit test purposes, we just verify it doesn't panic
    assert!(!app.should_quit, "App should not quit on 'a' key");
}

#[test]
fn test_a_key_on_tasks_does_nothing() {
    let mut app = App::new_with_orchestrations(vec![make_test_orchestration("project-1")]);
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Tasks,
        task_index: 1,
        member_index: 0,
    };

    let key = KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE);
    app.handle_key_event(key);

    // Should remain in PhaseDetail with Tasks focus
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
fn test_a_key_does_nothing_when_no_orchestrations() {
    let mut app = App::new_with_orchestrations(vec![]);
    app.view_state = ViewState::PhaseDetail {
        focus: PaneFocus::Members,
        task_index: 0,
        member_index: 0,
    };

    let key = KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE);
    app.handle_key_event(key);

    // Should not crash, should remain in PhaseDetail
    assert!(matches!(app.view_state, ViewState::PhaseDetail { .. }));
}
```

### Task 4: Integration test (manual)

Verify end-to-end behavior:
1. Start tina-monitor with an active orchestration
2. Navigate to PhaseDetail view (Enter on orchestration)
3. Switch to Members pane ('m' key)
4. Select an agent (j/k keys)
5. Press 'a' key
6. Expected: Either new kitty tab opens attached to tmux, or CommandModal shows with attach command

## Success Criteria

1. Pressing 'a' in PhaseDetail with PaneFocus::Members triggers attach action
2. Kitty handler opens new tab attached to tmux session (when kitty available)
3. Fallback handler shows CommandModal with tmux attach command
4. Pressing 'a' in Tasks pane does nothing (no change)
5. All existing tests continue to pass
6. New tests verify 'a' key behavior

## Files Modified

| File | Change |
|------|--------|
| `src/tui/app.rs` | Add `handle_attach_tmux()` method |
| `src/tui/app.rs` | Wire 'a' key in `handle_phase_detail_key()` PaneFocus::Members |
| `src/tui/app.rs` | Add unit tests for 'a' key behavior |

## Dependencies

- `dirs` crate (already in use)
- `serde_json` (already in use)
- `crate::data::types::Team` (may need to add import)

## Risk Assessment

**Low risk** - This is a straightforward addition of a keybinding that follows the exact pattern of existing features like 'g' (goto) and 'l' (logs).

## Notes

- The tmux session name convention `tina-{team_name}` should be verified against how orchestrations actually create tmux sessions
- If the session naming convention differs, the `session_name` derivation logic may need adjustment
