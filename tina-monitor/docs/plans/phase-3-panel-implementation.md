# Phase 3: Panel Implementation - Implementation Plan

## Overview

Connect panels to real data from the DataSource module and implement proper rendering. This phase transforms the placeholder panels from Phase 1 into functional displays of live orchestration data.

**Line Budget**: ~300 lines of new/modified code

---

## Current State (Post Phase 2)

The codebase has:
- `types.rs`: Full type definitions (TeamMember, Task, SupervisorState, etc.)
- `data/mod.rs`: DataSource with `load_orchestration()`, `load_tasks()`, `load_team()`
- `git/commits.rs`: `get_commits()` function returning `CommitSummary`
- `panels/*.rs`: Placeholder panels with hardcoded test data
- `app.rs`: App shell with global keys (no data source connection)
- `layout.rs`: PanelGrid managing 2x2 panel layout

---

## Tasks

### Task 1: Add Dashboard Header [~80 lines]

**File**: `src/dashboard.rs` (new file)

Create an htop-style header bar showing orchestration status.

```rust
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Frame;

use crate::types::{OrchestrationStatus, SupervisorState};

/// Dashboard header showing orchestration overview
pub struct Dashboard {
    feature: String,
    status: OrchestrationStatus,
    current_phase: u32,
    total_phases: u32,
    elapsed_mins: i64,
}

impl Dashboard {
    pub fn new() -> Self {
        Self {
            feature: String::new(),
            status: OrchestrationStatus::Planning,
            current_phase: 0,
            total_phases: 0,
            elapsed_mins: 0,
        }
    }

    pub fn update(&mut self, state: &SupervisorState) {
        self.feature = state.feature.clone();
        self.status = state.status;
        self.current_phase = state.current_phase;
        self.total_phases = state.total_phases;

        // Calculate elapsed time
        let now = chrono::Utc::now();
        self.elapsed_mins = (now - state.orchestration_started_at).num_minutes();
    }

    pub fn render(&self, frame: &mut Frame, area: Rect) {
        let status_color = match self.status {
            OrchestrationStatus::Executing => Color::Green,
            OrchestrationStatus::Planning => Color::Yellow,
            OrchestrationStatus::Reviewing => Color::Cyan,
            OrchestrationStatus::Complete => Color::Blue,
            OrchestrationStatus::Blocked => Color::Red,
        };

        let elapsed_str = format_duration(self.elapsed_mins);

        let line = Line::from(vec![
            Span::raw(" DASHBOARD: "),
            Span::styled(&self.feature, Style::default().add_modifier(Modifier::BOLD)),
            Span::raw(" | Phase "),
            Span::styled(
                format!("{}/{}", self.current_phase, self.total_phases),
                Style::default().fg(Color::Cyan),
            ),
            Span::raw(" | "),
            Span::styled(
                format!("{:?}", self.status).to_lowercase(),
                Style::default().fg(status_color),
            ),
            Span::raw(" | "),
            Span::styled(elapsed_str, Style::default().fg(Color::DarkGray)),
        ]);

        let block = Block::default()
            .borders(Borders::BOTTOM)
            .border_style(Style::default().fg(Color::DarkGray));

        let paragraph = Paragraph::new(line).block(block);
        frame.render_widget(paragraph, area);
    }
}

fn format_duration(mins: i64) -> String {
    if mins < 60 {
        format!("{}m elapsed", mins)
    } else {
        let hours = mins / 60;
        let remaining = mins % 60;
        format!("{}h {}m elapsed", hours, remaining)
    }
}

impl Default for Dashboard {
    fn default() -> Self {
        Self::new()
    }
}
```

**Test**: Unit tests for `format_duration()` and status color mapping.

---

### Task 2: Update TeamPanel with Real Data [~40 lines modified]

**File**: `src/panels/team.rs`

Modify TeamPanel to accept and render real TeamMember data.

```rust
use crate::panel::{Direction, HandleResult, Panel};
use crate::panels::{border_style, border_type};
use crate::types::TeamMember;
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState};
use ratatui::Frame;

pub struct TeamPanel {
    title: String,
    pub members: Vec<TeamMember>,
    pub selected: usize,
}

impl TeamPanel {
    pub fn new(title: &str) -> Self {
        Self {
            title: title.to_string(),
            members: Vec::new(),
            selected: 0,
        }
    }

    pub fn set_members(&mut self, members: Vec<TeamMember>) {
        self.members = members;
        // Reset selection if out of bounds
        if self.selected >= self.members.len() && !self.members.is_empty() {
            self.selected = self.members.len() - 1;
        }
    }

    pub fn selected_member(&self) -> Option<&TeamMember> {
        self.members.get(self.selected)
    }
}

impl Panel for TeamPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        // ... (keep existing navigation logic)
        // Change items.len() to members.len()
    }

    fn render(&self, frame: &mut Frame, area: Rect, focused: bool) {
        let block = Block::default()
            .title(self.title.as_str())
            .borders(Borders::ALL)
            .border_type(border_type(focused))
            .border_style(border_style(focused));

        let items: Vec<ListItem> = self.members
            .iter()
            .map(|member| {
                let model_short = shorten_model(&member.model);
                let line = Line::from(vec![
                    Span::styled(
                        if member.tmux_pane_id.is_some() { "●" } else { "○" },
                        Style::default().fg(Color::Green),
                    ),
                    Span::raw(" "),
                    Span::styled(&member.name, Style::default().add_modifier(Modifier::BOLD)),
                    Span::raw(" "),
                    Span::styled(model_short, Style::default().fg(Color::DarkGray)),
                ]);
                ListItem::new(line)
            })
            .collect();

        // Show empty state
        let list = if items.is_empty() {
            List::new(vec![ListItem::new(Span::styled(
                "  No team members",
                Style::default().fg(Color::DarkGray),
            ))])
        } else {
            List::new(items)
        };

        let list = list
            .block(block)
            .highlight_style(Style::default().bg(Color::DarkGray));

        let mut state = ListState::default();
        if !self.members.is_empty() {
            state.select(Some(self.selected));
        }

        frame.render_stateful_widget(list, area, &mut state);
    }

    fn name(&self) -> &'static str {
        // Return static reference based on title pattern
        if self.title.contains("Orchestrator") {
            "Orchestrator Team"
        } else {
            "Phase Team"
        }
    }
}

fn shorten_model(model: &str) -> &str {
    if model.contains("opus") {
        "opus"
    } else if model.contains("sonnet") {
        "sonnet"
    } else if model.contains("haiku") {
        "haiku"
    } else {
        model
    }
}
```

**Test**: Rendering with empty members, rendering with members, selection bounds.

---

### Task 3: Update TasksPanel with Real Data [~50 lines modified]

**File**: `src/panels/tasks.rs`

Modify TasksPanel to render real Task data with status icons.

```rust
use crate::panel::{Direction, HandleResult, Panel};
use crate::panels::{border_style, border_type};
use crate::types::{Task, TaskStatus};
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState};
use ratatui::Frame;

pub struct TasksPanel {
    pub tasks: Vec<Task>,
    pub selected: usize,
}

impl TasksPanel {
    pub fn new() -> Self {
        Self {
            tasks: Vec::new(),
            selected: 0,
        }
    }

    pub fn set_tasks(&mut self, tasks: Vec<Task>) {
        self.tasks = tasks;
        if self.selected >= self.tasks.len() && !self.tasks.is_empty() {
            self.selected = self.tasks.len() - 1;
        }
    }

    pub fn selected_task(&self) -> Option<&Task> {
        self.tasks.get(self.selected)
    }
}

impl Panel for TasksPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        // ... (keep existing navigation, change items.len() to tasks.len())
    }

    fn render(&self, frame: &mut Frame, area: Rect, focused: bool) {
        let block = Block::default()
            .title("Tasks")
            .borders(Borders::ALL)
            .border_type(border_type(focused))
            .border_style(border_style(focused));

        let items: Vec<ListItem> = self.tasks
            .iter()
            .map(|task| {
                let (icon, icon_color) = match task.status {
                    TaskStatus::Completed => ("[x]", Color::Green),
                    TaskStatus::InProgress => ("[>]", Color::Yellow),
                    TaskStatus::Pending => ("[ ]", Color::DarkGray),
                };

                let mut spans = vec![
                    Span::styled(icon, Style::default().fg(icon_color)),
                    Span::raw(" "),
                    Span::raw(&task.subject),
                ];

                // Show owner if assigned
                if let Some(owner) = &task.owner {
                    spans.push(Span::styled(
                        format!(" <- {}", owner),
                        Style::default().fg(Color::Cyan),
                    ));
                }

                // Show blocked indicator
                if !task.blocked_by.is_empty() {
                    spans.push(Span::styled(
                        " (blocked)",
                        Style::default().fg(Color::Red),
                    ));
                }

                ListItem::new(Line::from(spans))
            })
            .collect();

        let list = if items.is_empty() {
            List::new(vec![ListItem::new(Span::styled(
                "  No tasks",
                Style::default().fg(Color::DarkGray),
            ))])
        } else {
            List::new(items)
        };

        let list = list
            .block(block)
            .highlight_style(Style::default().bg(Color::DarkGray));

        let mut state = ListState::default();
        if !self.tasks.is_empty() {
            state.select(Some(self.selected));
        }

        frame.render_stateful_widget(list, area, &mut state);
    }

    fn name(&self) -> &'static str {
        "Tasks"
    }
}
```

**Test**: Rendering tasks with various statuses, blocked tasks, assigned tasks.

---

### Task 4: Update CommitsPanel with Git Integration [~50 lines modified]

**File**: `src/panels/commits.rs`

Modify CommitsPanel to render real git commits.

```rust
use crate::git::commits::Commit;
use crate::panel::{Direction, HandleResult, Panel};
use crate::panels::{border_style, border_type};
use crossterm::event::KeyEvent;
use ratatui::layout::Rect;
use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, ListState};
use ratatui::Frame;

pub struct CommitsPanel {
    pub commits: Vec<Commit>,
    pub selected: usize,
    pub stats: Option<(usize, usize)>,  // (insertions, deletions)
}

impl CommitsPanel {
    pub fn new() -> Self {
        Self {
            commits: Vec::new(),
            selected: 0,
            stats: None,
        }
    }

    pub fn set_commits(&mut self, commits: Vec<Commit>, insertions: usize, deletions: usize) {
        self.commits = commits;
        self.stats = Some((insertions, deletions));
        if self.selected >= self.commits.len() && !self.commits.is_empty() {
            self.selected = self.commits.len() - 1;
        }
    }

    pub fn selected_commit(&self) -> Option<&Commit> {
        self.commits.get(self.selected)
    }
}

impl Panel for CommitsPanel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
        // ... (keep existing navigation, change items.len() to commits.len())
    }

    fn render(&self, frame: &mut Frame, area: Rect, focused: bool) {
        // Build title with stats if available
        let title = match self.stats {
            Some((ins, del)) => format!("Commits (+{} -{}) ", ins, del),
            None => "Commits".to_string(),
        };

        let block = Block::default()
            .title(title)
            .borders(Borders::ALL)
            .border_type(border_type(focused))
            .border_style(border_style(focused));

        let items: Vec<ListItem> = self.commits
            .iter()
            .map(|commit| {
                let line = Line::from(vec![
                    Span::styled(
                        &commit.short_hash,
                        Style::default().fg(Color::Yellow),
                    ),
                    Span::raw(" "),
                    Span::raw(&commit.subject),
                ]);
                ListItem::new(line)
            })
            .collect();

        let list = if items.is_empty() {
            List::new(vec![ListItem::new(Span::styled(
                "  No commits in this phase",
                Style::default().fg(Color::DarkGray),
            ))])
        } else {
            List::new(items)
        };

        let list = list
            .block(block)
            .highlight_style(Style::default().bg(Color::DarkGray));

        let mut state = ListState::default();
        if !self.commits.is_empty() {
            state.select(Some(self.selected));
        }

        frame.render_stateful_widget(list, area, &mut state);
    }

    fn name(&self) -> &'static str {
        "Commits"
    }
}
```

**Test**: Rendering commits list, empty state, stats display.

---

### Task 5: Wire DataSource to App [~60 lines modified]

**File**: `src/app.rs`

Connect App to DataSource and propagate data to panels.

```rust
use std::path::PathBuf;
use crossterm::event::{KeyCode, KeyEvent};
use ratatui::layout::{Constraint, Direction, Layout};
use ratatui::Frame;

use crate::dashboard::Dashboard;
use crate::data::{DataSource, Orchestration};
use crate::git::commits::get_commits;
use crate::layout::PanelGrid;

pub struct App {
    grid: PanelGrid,
    dashboard: Dashboard,
    data_source: DataSource,
    current_feature: Option<String>,
    should_quit: bool,
}

impl App {
    pub fn new(fixture_path: Option<PathBuf>) -> Self {
        Self {
            grid: PanelGrid::new(),
            dashboard: Dashboard::new(),
            data_source: DataSource::new(fixture_path),
            current_feature: None,
            should_quit: false,
        }
    }

    /// Load an orchestration by feature name
    pub fn load_orchestration(&mut self, feature: &str) -> anyhow::Result<()> {
        let orchestration = self.data_source.load_orchestration(feature)?;
        self.current_feature = Some(feature.to_string());

        // Update dashboard
        self.dashboard.update(&orchestration.state);

        // Update team panels
        if let Some(team) = &orchestration.orchestrator_team {
            self.grid.set_orchestrator_team(team.members.clone());
        }
        if let Some(team) = &orchestration.phase_team {
            self.grid.set_phase_team(team.members.clone());
        }

        // Update tasks panel
        self.grid.set_tasks(orchestration.tasks.clone());

        // Load commits for current phase
        self.load_phase_commits(&orchestration)?;

        Ok(())
    }

    fn load_phase_commits(&mut self, orchestration: &Orchestration) -> anyhow::Result<()> {
        let phase_key = orchestration.state.current_phase.to_string();
        let phase = orchestration.state.phases.get(&phase_key);

        // Determine git range for commits
        let range = match phase.and_then(|p| p.git_range.as_ref()) {
            Some(range) => range.clone(),
            None => {
                // For in-progress phase, show commits since branch point
                // Use main..HEAD as fallback
                format!("main..HEAD")
            }
        };

        let cwd = &orchestration.state.worktree_path;
        match get_commits(cwd, &range) {
            Ok(summary) => {
                self.grid.set_commits(
                    summary.commits,
                    summary.insertions,
                    summary.deletions,
                );
            }
            Err(_) => {
                // Git range may not exist yet, show empty
                self.grid.set_commits(Vec::new(), 0, 0);
            }
        }

        Ok(())
    }

    /// Refresh data from files
    pub fn refresh(&mut self) -> anyhow::Result<()> {
        if let Some(feature) = &self.current_feature.clone() {
            self.load_orchestration(feature)?;
        }
        Ok(())
    }

    pub fn render(&self, frame: &mut Frame) {
        let area = frame.area();

        // Split: 1 row for dashboard, rest for grid
        let [dashboard_area, grid_area] = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Length(2), Constraint::Min(0)])
            .areas(area);

        self.dashboard.render(frame, dashboard_area);
        self.grid.render(frame, grid_area);
    }

    // ... keep existing handle_key, should_quit, get_panel_focus
}
```

---

### Task 6: Update PanelGrid with Data Setters [~30 lines added]

**File**: `src/layout.rs`

Add methods to set panel data.

```rust
impl PanelGrid {
    // ... existing methods ...

    /// Set orchestrator team members (top-left panel)
    pub fn set_orchestrator_team(&mut self, members: Vec<TeamMember>) {
        if let Some(panel) = self.panels[0][0].as_any_mut().downcast_mut::<TeamPanel>() {
            panel.set_members(members);
        }
    }

    /// Set phase team members (bottom-left panel)
    pub fn set_phase_team(&mut self, members: Vec<TeamMember>) {
        if let Some(panel) = self.panels[1][0].as_any_mut().downcast_mut::<TeamPanel>() {
            panel.set_members(members);
        }
    }

    /// Set tasks (top-right panel)
    pub fn set_tasks(&mut self, tasks: Vec<Task>) {
        if let Some(panel) = self.panels[0][1].as_any_mut().downcast_mut::<TasksPanel>() {
            panel.set_tasks(tasks);
        }
    }

    /// Set commits (bottom-right panel)
    pub fn set_commits(&mut self, commits: Vec<Commit>, insertions: usize, deletions: usize) {
        if let Some(panel) = self.panels[1][1].as_any_mut().downcast_mut::<CommitsPanel>() {
            panel.set_commits(commits, insertions, deletions);
        }
    }
}
```

Note: This requires adding `as_any_mut()` to the Panel trait or using a different pattern. Alternative: store typed panels directly instead of `Box<dyn Panel>`.

**Simpler approach**: Change PanelGrid to store concrete panel types:

```rust
pub struct PanelGrid {
    orchestrator_panel: TeamPanel,
    phase_panel: TeamPanel,
    tasks_panel: TasksPanel,
    commits_panel: CommitsPanel,
    focus: (usize, usize),
}
```

This eliminates the need for downcasting and is cleaner for a fixed 2x2 layout.

---

### Task 7: Update Fixture for Testing [~20 lines JSON]

**File**: `tests/fixtures/sample-orchestration/.claude/teams/test-feature/config.json`

Add team member data to fixture.

```json
{
  "name": "test-feature",
  "description": "Test orchestration",
  "leadAgentId": "team-lead-uuid",
  "members": [
    {
      "agent_id": "team-lead-uuid",
      "name": "team-lead",
      "agent_type": "team-lead",
      "model": "claude-opus-4",
      "tmux_pane_id": "%1",
      "cwd": "/path/to/worktree"
    },
    {
      "agent_id": "worker-1-uuid",
      "name": "worker-1",
      "agent_type": "worker",
      "model": "claude-sonnet-4",
      "tmux_pane_id": "%2",
      "cwd": "/path/to/worktree"
    }
  ]
}
```

---

### Task 8: Integration Test [~30 lines]

**File**: `tests/panel_data_tests.rs` (new)

```rust
use std::path::PathBuf;
use tina_monitor::app::App;

fn fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/sample-orchestration")
}

#[test]
fn test_app_loads_orchestration_data() {
    let mut app = App::new(Some(fixture_path()));
    let result = app.load_orchestration("test-feature");
    assert!(result.is_ok(), "should load orchestration from fixture");
}

#[test]
fn test_dashboard_shows_feature_name() {
    let mut app = App::new(Some(fixture_path()));
    app.load_orchestration("test-feature").unwrap();

    // Would need accessor or render test to verify
    // For now, just verify no panic
}

#[test]
fn test_empty_orchestration_graceful() {
    let app = App::new(Some(fixture_path()));
    // App with no orchestration loaded should render without panic
    // Need TestBackend to verify
}
```

---

## File Structure After Phase 3

```
tina-monitor/
├── src/
│   ├── main.rs           # CLI handling, passes fixture arg to App
│   ├── app.rs            # ~140 lines (added DataSource, refresh)
│   ├── dashboard.rs      # ~80 lines (NEW)
│   ├── layout.rs         # ~140 lines (added setters or concrete types)
│   ├── panel.rs          # ~60 lines (unchanged)
│   ├── panels/
│   │   ├── mod.rs        # ~50 lines (unchanged)
│   │   ├── team.rs       # ~80 lines (modified for real data)
│   │   ├── tasks.rs      # ~90 lines (modified for real data)
│   │   └── commits.rs    # ~80 lines (modified for git data)
│   ├── types.rs          # ~160 lines (unchanged)
│   ├── data/mod.rs       # ~200 lines (unchanged)
│   └── git/
│       ├── mod.rs        # ~30 lines (unchanged)
│       └── commits.rs    # ~90 lines (unchanged)
└── tests/
    ├── fixtures/
    │   └── sample-orchestration/
    │       └── ... (enhanced with team/task data)
    └── panel_data_tests.rs # ~30 lines (NEW)
```

**Phase 3 Additions**: ~300 lines
**Running Total**: ~985 lines (within budget)

---

## Dependencies

No new dependencies needed. Using existing:
- `ratatui` for TUI rendering
- `chrono` for time calculations
- `crate::git::commits` for commit data

---

## Existing Code to Reuse

**From existing codebase:**
- `git/commits.rs`: `get_commits()` function - use directly
- `git/mod.rs`: `git_command()` helper - use directly
- `data/mod.rs`: `DataSource` - use directly
- `types.rs`: All type definitions - use directly

**Do NOT reuse:**
- Old `tui/views/*.rs` - wrong architecture pattern
- Old `tui/app.rs` - god object anti-pattern

---

## Success Criteria

1. Dashboard shows feature name, phase progress, elapsed time, status
2. TeamPanel renders real team members with model/status indicators
3. TasksPanel renders tasks with status icons ([x], [>], [ ])
4. TasksPanel shows owner assignments and blocked indicators
5. CommitsPanel shows git commits for current phase
6. CommitsPanel shows +/- stats in title
7. Empty states display gracefully (no panic)
8. `--fixture` flag loads test data correctly
9. All tests pass
10. Total new lines < 350

---

## Not in This Phase

- Quicklook overlay (Phase 4)
- tmux attach/send actions (Phase 4)
- Fuzzy finder (Phase 4)
- Help screen (Phase 4)
- File watcher auto-refresh (use manual refresh for now)

---

## Verification Commands

```bash
# Build
cargo build -p tina-monitor

# Run tests
cargo test -p tina-monitor

# Manual verification - fixture data
cargo run -p tina-monitor -- --fixture tests/fixtures/sample-orchestration/

# Manual verification - live data (if orchestration running)
cargo run -p tina-monitor
```

---

## Implementation Notes

### Pattern Decision: Concrete vs Dynamic Panels

The current `PanelGrid` uses `Box<dyn Panel>` for flexibility. For Phase 3, two approaches:

**Option A: Add downcast support**
- Add `as_any()` method to Panel trait
- Use `downcast_ref()` to access concrete types
- More flexible but verbose

**Option B: Store concrete panel types**
- Change `PanelGrid` to hold `TeamPanel`, `TasksPanel`, `CommitsPanel` directly
- Simpler, more efficient, easier to maintain
- Layout is fixed 2x2, so flexibility isn't needed

**Recommendation**: Option B for simplicity. The 2x2 layout is fixed by design.

### Git Range Strategy

For in-progress phases without a finalized git range:
1. Check if phase has `git_range` set - use it
2. Otherwise, use `main..HEAD` as fallback
3. Handle git errors gracefully (show empty commits)

This ensures commits display even during active development.

### Refresh Strategy

For Phase 3, use explicit refresh:
- `App::refresh()` reloads data from files
- Could bind to 'r' key in app.rs

File watcher auto-refresh deferred to Phase 4/5 for simplicity.
