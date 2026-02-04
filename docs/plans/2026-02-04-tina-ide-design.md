# Tina IDE Design

## Overview

Tina IDE is a macOS-native AI orchestration environment built on gpui. It provides a unified window for observing, steering, and participating in AI orchestrations while maintaining your own development workflow.

## Problem

Working with tina orchestrations currently requires:
- tina-monitor TUI for observing progress
- Separate terminal windows for agent sessions
- Manual file editing to provide feedback
- Context switching between monitoring and development

There's no integrated environment for the full lifecycle from idea to implementation.

## Solution

A GUI application that combines:
- Orchestration monitoring (ported from tina-monitor)
- Embedded terminals (neovim, agent sessions, shells)
- Feedback mechanisms (comments, messages, signals)
- Project/story management (full lifecycle)

## Core Concepts

### Primary Workflow

**Observe → Steer → Participate**

- **Observe**: See orchestrations, phases, tasks, agents, commits, context usage
- **Steer**: Annotate artifacts with feedback that flows into agent context
- **Participate**: Edit plans/code directly, interact with agent sessions

### Lifecycle

Projects → Stories → Designs → Orchestrations → Monitoring

The IDE is the entry point for the entire workflow, not just monitoring.

## Architecture

### Technology Stack

- **Framework**: gpui (Rust, from Zed editor)
- **Data layer**: tina-session schema types (shared contract)
- **Terminal**: Embedded terminal emulator (alacritty_terminal approach)
- **Neovim**: Phase 1 runs in terminal, Phase 2+ can use remote UI protocol

### Window Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Tina IDE                                              [—][×]│
├─────────────┬───────────────────────────────────────────────┤
│             │                                               │
│  Sidebar    │              Main Area                        │
│             │         (flexible panes)                      │
│ • Projects  │                                               │
│ • Worktrees │   ┌─────────────────┬─────────────────┐      │
│ • Orchestr. │   │                 │                 │      │
│ • Agents    │   │   Editor/Term   │   Monitoring    │      │
│             │   │                 │                 │      │
│             │   │                 │                 │      │
│             │   ├─────────────────┴─────────────────┤      │
│             │   │         Agent Sessions            │      │
│             │   │                                   │      │
│             │   └───────────────────────────────────┘      │
│             │                                               │
├─────────────┴───────────────────────────────────────────────┤
│  Status: phase 2/4 │ ctx: 45% │ 3 agents │ feature-xyz     │
└─────────────────────────────────────────────────────────────┘
```

### Pane System

- Flexible splits (horizontal/vertical) like tmux or Zed
- Any pane can hold: terminal, monitoring view, neovim, plan/diff viewer
- Layouts can be saved/restored

### Data Flow

- File watcher detects changes to teams/tasks/state
- gpui reactive model updates views automatically
- Feedback written to files → picked up by orchestration

## Views

### Project Browser (entry point)

- List of all projects/repos
- Each project shows: worktrees, active orchestrations, pending stories
- Create new project, clone repo, set up worktree

### Story/Feature Backlog

- Stories are ideas/features not yet designed
- Add new story (title, rough description)
- Status: idea → designing → ready → orchestrating → done
- Stories stored in project (format TBD: markdown or JSON)

### Design Workspace

- Select story → enter design mode
- Split view: story description + design document
- Can invoke Claude for research/brainstorming
- Saves to `docs/plans/YYYY-MM-DD-{feature}-design.md`

### Orchestration Launcher

- Select ready design → "Start Orchestration"
- Creates worktree, initializes phases, spawns team-lead
- Transitions to monitoring view

### Orchestration List

- All active orchestrations across projects/worktrees
- Phase progress, task completion, context usage
- Click to focus, status indicators

### Phase Detail

- Current phase with tasks and assigned agents
- Task status (pending/in-progress/completed/blocked)
- Agent activity indicators
- Plan excerpt with syntax highlighting

### Agent Panel

- List of active agents in current orchestration
- Per-agent: name, current task, context %, last activity
- Click → opens session in terminal pane

### Commit Stream

- Live feed of commits from orchestration's worktree
- Click → diff view
- Annotate button → comment flows to orchestration

### Task Inspector

- Full task details: description, owner, blocks/blocked-by
- Edit button → opens in neovim
- Comment field → feedback to assigned agent

## Feedback Mechanisms

### Inline Comments (for artifacts)

- Commits: comment attached to SHA
- Plan sections: anchored to line
- Tasks: in task inspector
- Code: selection in neovim → send to agent

Storage: `.claude/tina/feedback/{artifact-type}/{id}.json`

Agents see relevant feedback in their context.

### Direct Messages (to agents)

- Select agent → compose message
- Uses existing mailbox system (Teammate tool)
- Urgent or advisory

### System Signals (orchestration control)

- Pause orchestration
- Request checkpoint
- Skip/complete task manually
- Adjust phase scope

Integrates with existing tina file-based signaling.

## Terminal & Editor

### Terminal Emulator

- Based on alacritty_terminal (Zed's approach)
- Full PTY, ANSI, mouse, true color
- Multiple instances in panes
- Can attach to tmux sessions

### Terminal Pane Types

- **Shell**: fresh shell in project directory
- **Neovim**: launches with user config, full plugin support
- **Agent session**: attaches to agent's tmux pane
- **Command**: runs specific command

### Neovim Integration

**Phase 1 (terminal):**
- Neovim runs in terminal pane
- Full config/plugin support
- Communication at terminal level
- "Send to agent" via visual selection

**Phase 2 (remote UI, optional):**
- nvim-rs for msgpack-rpc protocol
- Programmatic buffer/cursor access
- Deeper IDE integration

### Keybindings

- Global IDE shortcuts (panes, sidebar, command palette)
- Terminal/neovim focused → keys pass through
- Escape hatch for returning to IDE chrome

## Data Layer

### Shared Schema (from tina-session)

Per the test harness design, all state types live in tina-session:
- SupervisorState, PhaseState, OrchestrationStatus
- Team, Agent
- Task, TaskStatus
- ContextMetrics

IDE imports from `tina_session::state::schema::*`.

### IDE-Specific Data

```rust
struct Project {
    name: String,
    path: PathBuf,
    worktrees: Vec<Worktree>,
}

struct Story {
    id: String,
    title: String,
    description: String,
    status: StoryStatus,
    design_path: Option<PathBuf>,
}

struct Feedback {
    id: String,
    artifact: ArtifactRef,
    comment: String,
    status: FeedbackStatus,
    created_at: DateTime,
}
```

### Storage Abstraction

```rust
trait StateReader {
    fn load_orchestration(&self, worktree: &Path) -> Result<SupervisorState>;
    fn load_team(&self, name: &str) -> Result<Team>;
    fn load_tasks(&self, session_id: &str) -> Result<Vec<Task>>;
}
```

Initial: filesystem. Future: SQLite or remote API.

## Implementation Phases

### Phase 0a: Shared Data Layer (prerequisite)

- Create `tina-data` crate
- Extract data modules from tina-monitor (discovery, teams, tasks, tina_state, watcher)
- Add tina-session dependency for schema types (after test harness Phase 1)
- Update tina-monitor to use tina-data
- Verify tina-monitor still works

Outcome: Shared data layer ready for both TUI and IDE

### Phase 0b: Foundation

- gpui project structure for tina-ide
- Basic window with pane system
- Single terminal pane working
- Import tina-data
- Wire up file watcher

Outcome: IDE shell with working terminal

### Phase 1: Monitoring Views

- Orchestration list
- Phase detail view
- Status bar
- Sidebar navigation

Outcome: monitor orchestrations in GUI

### Phase 2: Terminal & Neovim

- Multiple terminal panes
- Neovim with user config
- Attach to tmux sessions
- Pane keybindings

Outcome: view agent sessions, edit in neovim

### Phase 3: Feedback Loop

- Inline comments on tasks
- Direct messages to agents
- System signals
- Feedback panel

Outcome: steer running orchestrations

### Phase 4: Project & Story Management

- Project browser
- Story backlog
- Design workspace
- Orchestration launcher

Outcome: full lifecycle management

### Phase 5: Polish

- Command palette
- Keyboard navigation
- Settings/preferences
- Commit annotations
- Code selection → agent

## Success Metrics

### Phase 0a (Shared Data Layer)

- tina-data crate compiles and exports all data types
- tina-monitor depends on tina-data, all tests pass
- No duplicate type definitions between crates
- Data loading works identically to before extraction

### Phase 0b-1 (Foundation + Monitoring)

- See all active orchestrations
- Refresh ≤ 1 second
- CPU ~5% idle, ~15% active
- Data matches tina-monitor TUI

### Phase 2 (Terminal & Neovim)

- Neovim full config works (plugins, LSP)
- Can attach to any agent tmux pane
- Input latency < 50ms
- 5+ panes without degradation

### Phase 3 (Feedback Loop)

- Task comment → agent sees within 2 turns
- Direct message → next context window
- Pause signal → pauses within 30 seconds
- Feedback status updates on acknowledgment

### Phase 4 (Projects & Stories)

- New story → running orchestration without leaving IDE
- Stories persist across sessions
- Designs save and link correctly
- Launcher creates worktree and starts team-lead

### Overall

- Prefer IDE over TUI + separate terminals
- Fewer "wrong direction" orchestrations
- Faster idea-to-orchestration time

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| gpui learning curve | Study Zed source, use terminal impl as reference |
| Terminal embedding complexity | Follow Zed's proven approach |
| Neovim remote UI harder than expected | Terminal approach is full fallback |
| Performance concerns | Profile early, gpui is GPU-accelerated |
| Scope creep | Strict phases, neovim handles editing |
| Feedback integration issues | Design format with orchestration early |
| tina-monitor bit-rot | Both use same data layer |

## Open Questions

1. **Feedback file format** - Structure for `.claude/tina/feedback/`? Part of tina-session schema?
2. **Story storage** - Markdown (editable in neovim) or JSON (queryable)?
3. **Project registry** - Global config or filesystem discovery?
4. **Keybinding philosophy** - IDE-global vs terminal-eats-all? Focus model TBD.

## Non-Goals (v1)

- Windows/Linux support
- Replacing Claude Code CLI
- Building a general-purpose editor (neovim handles that)
- Mobile or web versions

## Architectural Context

**Patterns to follow:**

- Data discovery pattern: `tina-monitor/src/data/discovery.rs:117-165` - `find_orchestrations()` iterates teams, loads state, assembles Orchestration structs
- File watcher with channel events: `tina-monitor/src/data/watcher.rs:16-50` - `WatchEvent` enum, `FileWatcher` struct with receiver pattern
- View state machine: `tina-monitor/src/tui/app.rs:17-35` - `ViewState` enum with variant-specific data (focus, indices, paths)
- Tmux integration: `tina-monitor/src/tmux/capture.rs` and `tina-monitor/src/tmux/send.rs` - pane existence checks, capture with history, send keys

**Code to reuse:**

- `tina-session/src/state/schema.rs` - Canonical schema types (SupervisorState, PhaseState, OrchestrationStatus, PhaseStatus, TimingStats)
- `tina-monitor/src/data/discovery.rs` - Orchestration discovery logic, team-to-worktree matching
- `tina-monitor/src/data/teams.rs` - Team loading, worktree matching (`find_teams_for_worktree`)
- `tina-monitor/src/data/tasks.rs` - Task loading with numeric sorting
- `tina-monitor/src/data/tina_state.rs` - Supervisor state and context metrics loading
- `tina-monitor/src/tmux/` - Reuse capture/send for agent session access

**Schema consolidation dependency:**

The test harness design (`docs/plans/2026-02-03-test-harness-design.md`) is consolidating types into tina-session. IDE should:
1. Wait for Phase 1 of test harness (schema consolidation) to complete
2. Import all types from `tina_session::state::schema::*`
3. Add Team, Agent, Task, ContextMetrics once moved to tina-session

**gpui learning resources:**

- [gpui.rs](https://www.gpui.rs/) - Official docs (sparse)
- [Zed gpui README](https://github.com/zed-industries/zed/blob/main/crates/gpui/README.md) - Framework overview
- Zed source `crates/terminal/` - Reference for terminal embedding
- [zTerm project](https://dev.to/zhiwei_ma_0fc08a668c1eb51/building-a-gpu-accelerated-terminal-emulator-with-rust-and-gpui-4103) - Community terminal emulator with gpui

**Integration points:**

- New crates: `tina-data` (shared data layer), `tina-ide` (GUI app)
- Dependency graph: `tina-session` ← `tina-data` ← `tina-monitor` / `tina-ide`
- File locations: `~/.claude/teams/`, `~/.claude/tasks/`, `{worktree}/.claude/tina/`
- Tmux: Reuses existing pane ID tracking from team configs (`Agent.tmux_pane_id`)

**Anti-patterns:**

- Don't duplicate types - see `tina-monitor/src/data/types.rs` duplicating `tina-session/src/state/schema.rs`
- Don't poll files directly - use file watcher pattern from `tina-monitor/src/data/watcher.rs`
- Don't shell out for data - load JSON directly, only shell for tmux commands

**Crate structure:**

```
tina-data/                    # NEW: shared data layer
├── Cargo.toml                # depends on tina-session (for schema types)
├── src/
│   ├── lib.rs
│   ├── discovery.rs          # Extract from tina-monitor
│   ├── teams.rs              # Extract from tina-monitor
│   ├── tasks.rs              # Extract from tina-monitor
│   ├── tina_state.rs         # Extract from tina-monitor
│   ├── watcher.rs            # Extract from tina-monitor
│   └── projects.rs           # New: project registry for IDE

tina-monitor/                 # Updated: depends on tina-data
├── Cargo.toml                # remove data modules, add tina-data dep
├── src/
│   ├── data/                 # Delete, replaced by tina-data
│   └── ...                   # TUI code remains

tina-ide/                     # NEW: GUI application
├── Cargo.toml                # depends on tina-data, gpui
├── src/
│   ├── main.rs               # gpui app entry
│   ├── app.rs                # App state, reactive models
│   ├── views/                # gpui view components
│   │   ├── mod.rs
│   │   ├── sidebar.rs
│   │   ├── orchestration_list.rs
│   │   ├── phase_detail.rs
│   │   └── terminal_pane.rs
│   └── terminal/             # Terminal embedding
│       ├── mod.rs
│       └── pty.rs
```

**Extraction order:**

1. Create `tina-data` crate
2. Move `tina-monitor/src/data/*` to `tina-data/src/`
3. Update imports, add `tina-session` dependency for schema types
4. Update `tina-monitor` to depend on `tina-data`, delete `src/data/`
5. Verify tina-monitor still works
6. Then proceed with tina-ide using tina-data
