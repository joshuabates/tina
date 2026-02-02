# Tina Monitor: Phase Browsing & Document Viewing

## Overview

Add the ability to browse through all phases of an orchestration (not just the current phase) and view the design document and phase plans directly from the TUI.

## Problem Statement

Current limitations in the PhaseDetail view:

1. **No phase navigation**: The Phases pane only displays the current phase info (Phase X/Y, status, context). Users cannot browse previous or upcoming phases to see their plans or review completed work.

2. **No document viewing in PhaseDetail**: While `p` opens the plan viewer in OrchestrationList view, there's no way to view documents when in PhaseDetail view. The design doc is completely inaccessible from the TUI.

3. **Static phase display**: The code explicitly has a TODO comment:
   ```rust
   PaneFocus::Phases => {
       // Phases navigation - for now just show current phase
       // Future: allow navigating to view different phases
   }
   ```

## Goals

1. **Phase list with selection**: Show all phases (1 through N) as a navigable list, not just current phase info
2. **Phase plan viewing**: View the plan for any selected phase with `p` key
3. **Design doc viewing**: View the design document with `D` key
4. **Context preservation**: Still show current phase status and context usage prominently

## Non-Goals

- Editing plans or design docs
- Jumping to different phase worktrees (phases share the same worktree)
- Phase-specific git operations (existing `c` and `d` for commits/diff are sufficient)

---

## Current State

### Phases Pane Rendering (`phase_detail.rs:268-296`)

```rust
fn render_phases_pane(frame: &mut Frame, area: Rect, orchestration: &Orchestration, is_focused: bool) {
    // Only shows current phase info, no list
    let status_text = match &orchestration.status { ... };
    let context_text = ...;
    let progress = ...;

    let content = vec![
        Line::from(format!("Phase {}/{}", orchestration.current_phase, orchestration.total_phases)),
        Line::from(status_text),
        Line::from(context_text),
        Line::from(progress),
    ];
    // Renders as Paragraph, not List
}
```

### Key Handling (`app.rs:826-828`)

```rust
PaneFocus::Phases => {
    // Phases navigation - for now just show current phase
    // Future: allow navigating to view different phases
}
```

### Plan Path Resolution (`app.rs:555-576`)

```rust
fn get_current_plan_path(&self) -> Option<std::path::PathBuf> {
    let phase = orch.current_phase;  // Only uses current phase
    let plan_name = format!("{}-phase-{}.md", ...);
    // No way to get plan for a different phase
}
```

---

## Proposed Solution

### Data Model Changes

Add `selected_phase` to track which phase is selected for viewing:

```rust
pub enum ViewState {
    PhaseDetail {
        focus: PaneFocus,
        task_index: usize,
        member_index: usize,
        layout: PhaseDetailLayout,
        selected_phase: u32,  // NEW: which phase is selected (1-indexed)
    },
    // ...
}
```

### UI Changes

#### Phases Pane (redesigned)

Transform from info display to selectable list:

```
┌─ Phases ─────────────────────┐
│ ✓ Phase 1 (complete)         │
│ ✓ Phase 2 (complete)         │
│ ✓ Phase 3 (complete)         │
│ ▶ Phase 4 (executing)        │  ← current
│ ○ Phase 5                    │
├──────────────────────────────┤
│ Context: 45%                 │
│ [████████░░░░░░░░░░░░]       │
└──────────────────────────────┘
```

- Phases listed with status indicators
- Current phase marked with `▶` and highlighted
- Selected phase (for viewing) has cursor/highlight
- Context bar stays at bottom (applies to current execution)

#### Status Indicators

| Symbol | Meaning |
|--------|---------|
| `✓` | Phase complete (review passed) |
| `▶` | Currently executing |
| `✗` | Blocked |
| `○` | Pending (not started) |
| `⚠` | Review found gaps |

#### Key Bindings

| Key | Action |
|-----|--------|
| `j`/`k` | Navigate phase list (when Phases pane focused) |
| `p` | View plan for selected phase |
| `D` | View design document |
| `Enter` | View plan for selected phase (alternative) |

#### Footer Updates

```
PhaseDetail: " h/l:panes  Tab:tasks/team  j/k:nav  p:plan  D:design  c:commits  d:diff  Enter:logs  s:send  Esc:back  ?:help"
```

### Implementation Details

#### 1. ViewState Changes (`app.rs`)

```rust
pub enum ViewState {
    PhaseDetail {
        focus: PaneFocus,
        task_index: usize,
        member_index: usize,
        layout: PhaseDetailLayout,
        selected_phase: u32,  // NEW
    },
    // Existing variants unchanged
}
```

Update all places that construct `ViewState::PhaseDetail` to include `selected_phase`, defaulting to `orch.current_phase`.

#### 2. Phase Navigation (`app.rs`)

```rust
PaneFocus::Phases => {
    let total_phases = self.orchestrations
        .get(self.selected_index)
        .map(|o| o.total_phases)
        .unwrap_or(1);

    match key.code {
        KeyCode::Char('j') | KeyCode::Down => {
            let new_phase = (selected_phase % total_phases) + 1;
            self.view_state = ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                layout,
                selected_phase: new_phase,
            };
        }
        KeyCode::Char('k') | KeyCode::Up => {
            let new_phase = if selected_phase <= 1 {
                total_phases
            } else {
                selected_phase - 1
            };
            self.view_state = ViewState::PhaseDetail {
                focus,
                task_index,
                member_index,
                layout,
                selected_phase: new_phase,
            };
        }
        KeyCode::Char('p') | KeyCode::Enter => {
            self.handle_view_phase_plan(selected_phase);
        }
        _ => {}
    }
}
```

#### 3. New Plan Path Function (`app.rs`)

```rust
/// Get the plan path for a specific phase
fn get_plan_path_for_phase(&self, phase: u32) -> Option<std::path::PathBuf> {
    if self.orchestrations.is_empty() {
        return None;
    }

    let orch = &self.orchestrations[self.selected_index];

    let plan_name = format!(
        "{}-phase-{}.md",
        orch.design_doc_path.file_stem()?.to_str()?,
        phase
    );

    let plan_path = orch
        .cwd
        .parent()?
        .join("docs")
        .join("plans")
        .join(plan_name);

    if plan_path.exists() {
        Some(plan_path)
    } else {
        None
    }
}

/// Handle viewing plan for a specific phase
fn handle_view_phase_plan(&mut self, phase: u32) -> AppResult<()> {
    if let Some(plan_path) = self.get_plan_path_for_phase(phase) {
        self.view_state = ViewState::PlanViewer {
            plan_path,
            scroll_offset: 0,
        };
    }
    Ok(())
}
```

#### 4. Design Doc Viewing (`app.rs`)

```rust
/// Handle view design doc action
fn handle_view_design_doc(&mut self) -> AppResult<()> {
    if self.orchestrations.is_empty() {
        return Ok(());
    }

    let orch = &self.orchestrations[self.selected_index];
    let design_path = &orch.design_doc_path;

    if design_path.exists() {
        self.view_state = ViewState::PlanViewer {
            plan_path: design_path.clone(),
            scroll_offset: 0,
        };
    }
    Ok(())
}
```

Add key handler in `handle_phase_detail_key`:

```rust
KeyCode::Char('D') => {
    let _ = self.handle_view_design_doc();
    return;
}
```

#### 5. Phases Pane Rendering (`phase_detail.rs`)

```rust
fn render_phases_pane(
    frame: &mut Frame,
    area: Rect,
    orchestration: &Orchestration,
    is_focused: bool,
    selected_phase: u32,  // NEW parameter
) {
    // Split area: list on top, context bar on bottom
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(3), Constraint::Length(4)])
        .split(area);

    // Build phase list
    let items: Vec<ListItem> = (1..=orchestration.total_phases)
        .map(|phase| {
            let is_current = phase == orchestration.current_phase;
            let is_selected = phase == selected_phase;

            let (indicator, status_color) = get_phase_status(orchestration, phase);

            let cursor = if is_selected && is_focused { "▶ " } else { "  " };

            let style = if is_selected {
                Style::default().add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };

            let current_marker = if is_current { " ◀" } else { "" };

            ListItem::new(Line::from(vec![
                Span::raw(cursor),
                Span::styled(indicator, Style::default().fg(status_color)),
                Span::raw(" "),
                Span::styled(format!("Phase {}", phase), style),
                Span::styled(current_marker, Style::default().fg(Color::Cyan)),
            ]))
        })
        .collect();

    let border_style = border_style(is_focused);
    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title("Phases [p:plan D:design]")
            .border_style(border_style),
    );
    frame.render_widget(list, chunks[0]);

    // Context bar (bottom)
    render_context_bar(frame, chunks[1], orchestration);
}

fn get_phase_status(orchestration: &Orchestration, phase: u32) -> (&'static str, Color) {
    if phase < orchestration.current_phase {
        // Past phase - assume complete (could check review status if available)
        ("✓", Color::Green)
    } else if phase == orchestration.current_phase {
        match &orchestration.status {
            OrchestrationStatus::Executing { .. } => ("▶", Color::Cyan),
            OrchestrationStatus::Blocked { .. } => ("✗", Color::Red),
            OrchestrationStatus::Complete => ("✓", Color::Green),
            OrchestrationStatus::Idle => ("○", Color::DarkGray),
        }
    } else {
        // Future phase
        ("○", Color::DarkGray)
    }
}

fn render_context_bar(frame: &mut Frame, area: Rect, orchestration: &Orchestration) {
    let context_text = if let Some(pct) = orchestration.context_percent {
        format!("Context: {}%", pct)
    } else {
        "Context: --".to_string()
    };

    let progress = orchestration
        .context_percent
        .map(|pct| progress_bar::render(pct as usize, 100, area.width.saturating_sub(4) as usize))
        .unwrap_or_else(|| "[----------]".to_string());

    let content = vec![
        Line::from(context_text),
        Line::from(progress),
    ];

    let paragraph = Paragraph::new(content).block(
        Block::default()
            .borders(Borders::TOP)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(paragraph, area);
}
```

#### 6. Update Render Calls

Update `render_orch_phase_tasks` and any other callers to pass `selected_phase`:

```rust
fn render_orch_phase_tasks(
    frame: &mut Frame,
    area: Rect,
    app: &App,
    orchestration: &Orchestration,
    focus: PaneFocus,
    task_index: usize,
    member_index: usize,
    selected_phase: u32,  // NEW
) {
    // ...
    render_phases_pane(frame, columns[1], orchestration, focus == PaneFocus::Phases, selected_phase);
    // ...
}
```

---

## File Changes

| File | Change |
|------|--------|
| `tina-monitor/src/tui/app.rs` | Add `selected_phase` to ViewState, add phase navigation in `handle_phase_detail_key`, add `handle_view_design_doc`, add `get_plan_path_for_phase`, update footer text |
| `tina-monitor/src/tui/views/phase_detail.rs` | Rewrite `render_phases_pane` as list, add `get_phase_status`, add `render_context_bar`, update render function signatures |
| `tina-monitor/src/tui/ui.rs` | Update footer text for PhaseDetail view |

---

## Testing

### Unit Tests

1. **Phase selection wraps correctly**
   - j at phase N goes to phase 1
   - k at phase 1 goes to phase N

2. **Plan path resolution**
   - Returns correct path for each phase
   - Returns None for non-existent phases
   - Handles missing plan files gracefully

3. **Phase status derivation**
   - Past phases show as complete
   - Current phase reflects orchestration status
   - Future phases show as pending

### Manual Testing

1. Launch TUI with active orchestration
2. Navigate to PhaseDetail view
3. Focus Phases pane with `h`/`l`
4. Use `j`/`k` to browse phases
5. Press `p` to view selected phase plan
6. Press `D` to view design doc
7. Verify current phase is marked
8. Verify context bar shows correctly

---

## Success Criteria

1. Can browse all phases with j/k when Phases pane is focused
2. Can view plan for any phase (past, current, or planned future)
3. Can view design document from PhaseDetail view
4. Current phase is visually distinct from selected phase
5. Context usage bar remains visible
6. All existing functionality (tasks, team, commits, diff, logs) unchanged

---

## Mockup

```
┌─ Orchestrations ─────┐┌─ gray-box-303-design ────────┐┌─ Tasks (12) [Tab: switch] ──────────────────────┐
│ ▶ ● gray-box-303     ││ ▶ ✓ Phase 1                  ││ ✓ Task 4.1: Create Weight Conversion Script     │
│                      ││   ✓ Phase 2                  ││ ✓ Task 4.2: Implement Parameter Encoder         │
│                      ││   ✓ Phase 3                  ││ ✓ Task 4.3.1: Implement Polynomial Saturation   │
│                      ││   ▶ Phase 4              ◀   ││ ...                                             │
│                      ││   ○ Phase 5                  │├─────────────────────────────────────────────────┤
│                      │├──────────────────────────────┤│ Team (2) [Tab: switch]                          │
│                      ││ Context: --                  ││ team-lead (team-lead/opus)                      │
│                      ││ [----------]                 ││ worker-10 (agent/opus)                          │
│                      │└──────────────────────────────┘└─────────────────────────────────────────────────┘
└──────────────────────┘
h/l:panes  Tab:tasks/team  j/k:nav  p:plan  D:design  c:commits  d:diff  Enter:logs  s:send  Esc:back  ?:help
```

In this mockup:
- Phase 1 is selected (cursor `▶`) for viewing its plan
- Phase 4 is the current executing phase (marked with `◀`)
- User can press `p` to view Phase 1's plan, or navigate to other phases

---

## Implementation Order

1. Add `selected_phase` to ViewState and update all constructors
2. Implement phase navigation (j/k) in `handle_phase_detail_key`
3. Rewrite `render_phases_pane` as a list with selection
4. Add `get_plan_path_for_phase` function
5. Add `handle_view_phase_plan` bound to `p` key
6. Add `handle_view_design_doc` bound to `D` key
7. Update footer help text
8. Write tests
9. Manual testing with real orchestration
