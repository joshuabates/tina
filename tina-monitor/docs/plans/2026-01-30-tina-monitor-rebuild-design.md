# tina-monitor Rebuild Design

## Problem Statement

The current tina-monitor codebase is 10,600 lines of Rust that doesn't work:

- **No data source**: Built to read `supervisor-state.json` that nothing created (now fixed by tina-session)
- **Mock-only tests**: 300+ tests pass on fake data, fail on reality
- **Wrong UI paradigm**: Modal-based flow instead of multi-panel dashboard
- **God object**: `app.rs` is 3,185 lines handling all views, all key events, all business logic
- **Over-engineered**: Elaborate abstractions for features that don't function

Even if fixed, the UI paradigm doesn't match what's wanted: a keyboard-driven multi-panel dashboard like htop meets lazygit.

## Goal

Rebuild tina-monitor with:

- **~1,500 lines** (down from 10,600)
- **Multi-panel dashboard** with vim-style navigation
- **Integration with tina-session** for real data
- **Fixture-based testing** for reliable verification
- **Clean architecture** where each component owns its logic

## Success Metrics

| Metric | Target |
|--------|--------|
| Total lines of code | < 2,000 |
| Max file size | < 200 lines |
| Integration tests | Runs against fixtures |
| Real orchestration test | Discovers and displays live data |

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DASHBOARD: feature-name │ Phase 2/5 │ 47m elapsed │ [/] Find  [?] Help     │
├────────────────────────┬────────────────────────────────────────────────────┤
│ ORCHESTRATOR TEAM      │ TASKS                                              │
│                        │                                                    │
│ ● team-lead    opus    │ [✓] Set up project structure                       │
│ ○ planner-1    idle    │ [✓] Implement auth middleware                      │
│ ○ executor-1   working │ [→] Add token refresh logic         ← executor-1   │
│                        │ [ ] Write integration tests                        │
│                        │ [ ] Update API documentation                       │
├────────────────────────┼────────────────────────────────────────────────────┤
│ PHASE TEAM             │ COMMITS                                            │
│                        │                                                    │
│ ● phase-lead   opus    │ abc1234 feat: add auth middleware                  │
│ ○ worker-1     working │ def5678 feat: implement token validation           │
│ ○ worker-2     idle    │ 789abcd refactor: extract token utils              │
│ ○ reviewer     idle    │                                                    │
│                        │                                                    │
└────────────────────────┴────────────────────────────────────────────────────┘
 [a] Attach  [s] Send  [Space] Quicklook                    ← context-aware hints
```

### Navigation

| Key | Action |
|-----|--------|
| `h/j/k/l` or arrows | Navigate within list, cross to adjacent panel at boundary |
| `Space` | Quicklook selected entity |
| `/` | Fuzzy find project |
| `?` | Help |
| `q` or `Esc` | Quit / close overlay |

### Entity-Specific Actions

| Entity | Key | Action |
|--------|-----|--------|
| Team Member | `a` | Attach to tmux session |
| Team Member | `s` | Send command dialog |
| Team Member | `l` | View logs |
| Task | `i` | Inspect full details |
| Task | `o` | Jump to owner (focus team member) |
| Commit | `d` | View diff |
| Commit | `y` | Copy SHA |
| Phase | `p` | View plan |

---

## Architecture

### Core Abstractions

```
┌─────────────────────────────────────────────────────┐
│                       App                            │
│  - Global key handling (quit, help, find)           │
│  - Overlay management                               │
│  - Action execution                                 │
├─────────────────────────────────────────────────────┤
│                    PanelGrid                         │
│  - 2x2 layout of panels                             │
│  - Focus tracking (row, col)                        │
│  - Routes keys to focused panel                     │
│  - Handles MoveFocus requests                       │
├──────────────┬──────────────┬───────────────────────┤
│ TeamPanel    │ TasksPanel   │ CommitsPanel          │
│ (implements  │ (implements  │ (implements           │
│  Panel)      │  Panel)      │  Panel)               │
└──────────────┴──────────────┴───────────────────────┘
```

### Panel Trait

Each panel owns its state and input handling:

```rust
pub enum HandleResult {
    Consumed,                    // Key was handled
    Ignored,                     // Key not relevant
    MoveFocus(Direction),        // Request focus change
    Quicklook(Entity),          // Open quicklook overlay
    EntityAction(EntityAction), // Execute entity-specific action
}

pub trait Panel {
    fn handle_key(&mut self, key: KeyEvent) -> HandleResult;
    fn render(&self, frame: &mut Frame, area: Rect, focused: bool);
    fn selected_entity(&self) -> Option<Entity>;
}
```

### Boundary-Aware Navigation

When `j/k` navigation hits list boundary, focus moves to adjacent panel:

```rust
fn handle_key(&mut self, key: KeyEvent) -> HandleResult {
    match key.code {
        KeyCode::Char('j') | KeyCode::Down => {
            if self.selected < self.items.len() - 1 {
                self.selected += 1;
                HandleResult::Consumed
            } else {
                HandleResult::MoveFocus(Direction::Down)
            }
        }
        // ...
    }
}
```

### Entity System

Entities know their available actions:

```rust
pub enum Entity {
    TeamMember(TeamMember),
    Task(Task),
    Commit(Commit),
    Phase(Phase),
}

impl Entity {
    pub fn available_actions(&self) -> Vec<(char, &'static str, EntityAction)> {
        match self {
            Entity::TeamMember(m) => vec![
                ('a', "Attach", EntityAction::AttachTmux { ... }),
                ('s', "Send", EntityAction::SendCommand { ... }),
            ],
            Entity::Task(t) => vec![
                ('i', "Inspect", EntityAction::ViewTaskDetail { ... }),
                ('o', "Jump to owner", EntityAction::JumpToOwner { ... }),
            ],
            // ...
        }
    }
}
```

The dashboard and quicklook both use `available_actions()` to show context-aware hints.

### Quicklook Overlay

Generic overlay that adapts to entity type:

- Renders entity-specific content (team member details, task description, commit message)
- Shows available actions in footer
- Handles action keys directly
- `Space` or `Esc` closes

---

## Data Integration

### Source: tina-session

tina-monitor reads from tina-session's managed state:

| File | Contents |
|------|----------|
| `~/.claude/tina-sessions/*.json` | Session lookup (feature → worktree path) |
| `{worktree}/.claude/tina/supervisor-state.json` | Orchestration state, phases, timing |
| `~/.claude/teams/{team}/config.json` | Team members |
| `~/.claude/tasks/{team}/*.json` | Tasks |

### DataSource Module

```rust
pub struct DataSource {
    fixture_path: Option<PathBuf>,  // For testing
    current: Option<Orchestration>,
    watcher: Option<FileWatcher>,
}

impl DataSource {
    pub fn new(fixture_path: Option<PathBuf>) -> Self;
    pub fn orchestrations(&self) -> Vec<OrchestrationSummary>;
    pub fn load_orchestration(&mut self, name: &str) -> Result<Orchestration>;
    pub fn poll_updates(&mut self) -> bool;
}
```

### Fixture-Based Testing

```bash
# Run TUI against test fixtures
tina-monitor --fixture tests/fixtures/sample-orchestration/

# Integration test
cargo test --test integration
```

Fixtures are directories containing the expected file structure with sample data.

---

## File Structure

```
tina-monitor/
├── Cargo.toml
├── src/
│   ├── main.rs           # CLI args, terminal setup, event loop
│   ├── app.rs            # App struct, global keys, action handling
│   ├── panel.rs          # Panel trait, HandleResult, Direction
│   ├── layout.rs         # PanelGrid, focus management
│   ├── entity.rs         # Entity enum, EntityAction, available_actions
│   ├── panels/
│   │   ├── mod.rs
│   │   ├── team.rs       # Team member list panel
│   │   ├── tasks.rs      # Task list panel
│   │   └── commits.rs    # Git commits panel
│   ├── dashboard.rs      # htop-style header bar
│   ├── overlay/
│   │   ├── mod.rs
│   │   ├── quicklook.rs  # Entity quicklook
│   │   ├── fuzzy.rs      # Project finder
│   │   └── help.rs       # Help screen
│   ├── data.rs           # tina-session integration
│   ├── actions.rs        # tmux attach, send commands
│   └── types.rs          # TeamMember, Task, Commit, etc.
├── tests/
│   ├── fixtures/
│   │   └── sample-orchestration/
│   │       ├── .claude/tina/supervisor-state.json
│   │       └── ...
│   └── integration.rs
└── docs/
    └── plans/
```

### Line Budget

| File | Lines |
|------|-------|
| main.rs | ~60 |
| app.rs | ~180 |
| panel.rs | ~60 |
| layout.rs | ~100 |
| entity.rs | ~100 |
| panels/*.rs | ~300 |
| dashboard.rs | ~80 |
| overlay/*.rs | ~340 |
| data.rs | ~120 |
| actions.rs | ~80 |
| types.rs | ~80 |
| **Total** | **~1,500** |

---

## Implementation Phases

### Phase 1: Core Framework
- Panel trait and PanelGrid
- Basic app loop with focus management
- Navigation working across panels
- Placeholder content in each panel

### Phase 2: Data Integration
- DataSource reading from tina-session files
- Fixture loading for testing
- File watcher for live updates

### Phase 3: Panel Implementation
- TeamPanel with real data
- TasksPanel with real data
- CommitsPanel with git integration
- Dashboard with timing/status

### Phase 4: Overlays & Actions
- Quicklook overlay
- Fuzzy finder
- tmux attach/send actions
- Help screen

### Phase 5: Polish
- Error handling
- Edge cases (empty states, missing data)
- Visual refinement

---

## Dependencies

```toml
[dependencies]
ratatui = "0.29"
crossterm = "0.28"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
dirs = "5"
notify = "7"          # File watching
nucleo = "0.5"        # Fuzzy matching (same as helix uses)
chrono = "0.4"
clap = { version = "4", features = ["derive"] }

[dev-dependencies]
tempfile = "3"
```

---

## What We're NOT Building

- Log streaming (use tmux attach instead)
- Inline diff viewer (use quicklook → action → external viewer)
- Multiple orchestration tabs (one at a time, use fuzzy finder to switch)
- Configuration file (sensible defaults only)

---

## Design Decisions

1. **Panel layout**: Top-left shows orchestrator-level agents (team-lead, planners, executors). Bottom-left shows current phase's team (phase-lead, workers, reviewers).

2. **Git commits**: Shows commits since phase start, even for in-progress phases (before git range is finalized).

3. **Refresh strategy**: File watcher for auto-refresh. No manual refresh needed.

---

## Architectural Context

**Reusable from existing codebase:**
- `src/data/types.rs` - Team, Agent, Task, TaskStatus structs are correct and tested
- `src/data/watcher.rs` - FileWatcher pattern is sound, reuse with minor adaptation
- `src/git/commits.rs`, `src/git/diff.rs` - Git operations can be extracted

**Schema alignment required:**
- tina-monitor's `SupervisorState` (src/data/types.rs:67-76) differs from tina-session's schema
- tina-session uses: `feature`, `design_doc`, `worktree_path`, `branch`, `phases` HashMap
- tina-monitor uses: `design_doc_path`, `worktree_path`, `branch_name`, `plan_paths` HashMap
- **Action:** Align types.rs with tina-session's `schema.rs` or add adapter

**Data source paths:**
- Session lookup: `~/.claude/tina-sessions/{feature}.json` (tina-session)
- Supervisor state: `{worktree}/.claude/tina/supervisor-state.json` (tina-session)
- Teams: `~/.claude/teams/{team}/config.json` (claude-code)
- Tasks: `~/.claude/tasks/{team}/*.json` (claude-code)

**Anti-patterns to avoid:**
- Don't replicate app.rs god-object pattern - each panel owns its logic
- Don't mock data in tests - use fixture files with real structure
- Don't put all key handlers in one file - Panel trait distributes responsibility

**Integration points:**
- Entry: `main.rs` CLI with `--fixture` flag for testing
- DataSource reads from tina-session's SessionLookup to discover orchestrations
- FileWatcher monitors `~/.claude/tina-sessions/` and team/task directories
- tmux operations use existing `src/tmux/send.rs` patterns
