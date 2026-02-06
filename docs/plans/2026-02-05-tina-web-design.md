# Tina Web Design

## Overview

Tina Web is a React web app with a Rust (Axum) backend that provides a browser-based frontend over tina-monitor's data layer. It serves as both a monitoring dashboard and a validation tool for the entire orchestration data pipeline.

## Problem

The tina-monitor TUI shows stale orchestrations and incorrect data. We have no way to validate whether:
- Orchestrations write correct state to disk
- The data layer reads it correctly
- The display matches reality

The TUI cannot be tested programmatically. A web app can be validated with Playwright, enabling three-way comparison between expected state (harness), files on disk, and what the UI displays.

## Solution

A web dashboard that:
- Displays orchestration state from the same data layer tina-monitor uses
- Updates in real-time via WebSocket when files change
- Can be validated with Playwright (screenshot, DOM reads, assertions)
- Works with tina-harness scenarios that write to real `~/.claude/` locations

## Architecture

### Dependency Graph

```
tina-session  <-  tina-data  <-  tina-monitor (TUI)
                              <-  tina-web (Axum backend + React frontend)
```

### Technology Stack

- **Backend**: Axum, tokio, serde_json, tower
- **Frontend**: Vite, React, TypeScript, Tailwind CSS
- **Real-time**: WebSocket (Axum ws + browser WebSocket API)
- **File watching**: notify crate (reused from tina-data watcher)
- **Validation**: Playwright MCP tools

### Project Structure

```
tina-data/                        # NEW: shared data layer
├── Cargo.toml                    # depends on tina-session
├── src/
│   ├── lib.rs
│   ├── discovery.rs              # from tina-monitor/src/data/
│   ├── teams.rs                  # from tina-monitor/src/data/
│   ├── tasks.rs                  # from tina-monitor/src/data/
│   ├── tina_state.rs             # from tina-monitor/src/data/
│   └── watcher.rs                # from tina-monitor/src/data/

tina-web/                         # NEW: web app
├── Cargo.toml                    # depends on tina-data, axum, tokio, tower
├── src/
│   ├── main.rs                   # Axum server, port 3100
│   ├── api.rs                    # REST endpoints
│   ├── ws.rs                     # WebSocket handler + file watcher
│   └── state.rs                  # Shared app state
└── frontend/
    ├── package.json
    ├── vite.config.ts            # proxy /api + /ws to localhost:3100
    ├── tailwind.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── types.ts              # TypeScript types matching Rust schemas
        ├── hooks/
        │   └── useOrchestrations.ts   # WebSocket subscription
        └── components/
            ├── OrchestrationList.tsx
            ├── OrchestrationDetail.tsx
            ├── PhaseList.tsx
            ├── TaskList.tsx
            ├── TeamPanel.tsx
            └── StatusBar.tsx
```

## API Design

### REST Endpoints

```
GET /api/orchestrations              -> Vec<Orchestration>
GET /api/orchestrations/:id          -> Orchestration (full detail)
GET /api/orchestrations/:id/tasks    -> Vec<Task>
GET /api/orchestrations/:id/team     -> Vec<Agent>
GET /api/orchestrations/:id/phases   -> HashMap<String, PhaseState>
GET /api/health                      -> { status: "ok" }
```

Orchestration ID is the team name (unique per orchestration).

### WebSocket

```
ws://localhost:3100/ws

Server pushes on file change:
{ "type": "orchestrations_updated", "data": [...] }
{ "type": "tasks_updated", "orchestration_id": "...", "data": [...] }
```

File watcher monitors `~/.claude/teams/`, `~/.claude/tasks/`, and known worktree `.claude/tina/` directories. On change, reloads affected data and pushes full updated state. No incremental diffing for v1.

### Serialization

All Rust types derive `Serialize`. The JSON shape matches the tina-session schema types directly. TypeScript types are manually written to match (generated codegen is a future optimization).

## Frontend Views

### OrchestrationList (landing page, `/`)

Table of all discovered orchestrations:
- Team name
- Feature name
- Phase progress (e.g., "2/4")
- Task summary (e.g., "3/7 completed")
- Status badge (Planning, Executing, Reviewing, Complete, Blocked)
- Context % (if available)

Click row to navigate to detail view.

### OrchestrationDetail (`/orchestration/:id`)

Header: feature name, branch, status badge, overall timing.

Three panels:
- **Phases**: List with status badges, timing breakdown (planning/execution/review), git range. Expandable for detail.
- **Tasks**: Full task list with status, owner, blocked-by relationships. Expandable rows for description and metadata.
- **Team**: Agent list with name, type, model, tmux pane ID, cwd.

### StatusBar (persistent footer)

- WebSocket connection indicator (connected/disconnected)
- Last update timestamp
- Number of active orchestrations

## Data Flow

1. Axum server starts, performs initial `find_orchestrations()` via tina-data
2. File watcher starts monitoring `~/.claude/teams/`, `~/.claude/tasks/`
3. React app connects via WebSocket, receives initial state
4. On file change: watcher notifies -> server reloads affected data -> pushes to all WebSocket clients
5. React updates via state hook, re-renders affected components

## Validation Strategy

### Three-Way Comparison

```
expected.json (harness)  <->  files on disk  <->  web UI (Playwright)
```

1. tina-harness writes a scenario to real `~/.claude/` locations
2. Playwright navigates to `localhost:3100`
3. Read raw JSON files with Read tool
4. Read web UI DOM with Playwright
5. Compare all three: expected state vs disk vs display
6. Discrepancies pinpoint which layer has the bug

### What Playwright Can Verify

- Orchestration count and names visible in the list
- Phase progress numbers match
- Task statuses and counts match
- Agent names and assignments match
- Status badges are correct
- WebSocket updates propagate (change a file, verify UI updates)

## Implementation Phases

### Phase 1: tina-data Extraction

- Create `tina-data` crate in workspace
- Move `tina-monitor/src/data/*` modules into `tina-data/src/`
- Add tina-session dependency for schema types
- Update tina-monitor to depend on tina-data, remove `src/data/`
- Audit data loading logic during extraction
- Verify tina-monitor compiles and its existing tests pass

### Phase 2: Axum Backend

- Create `tina-web` crate in workspace
- Axum server on port 3100
- REST endpoints wrapping tina-data functions
- WebSocket handler with file watcher integration
- Serve built frontend static files from `/`
- JSON serialization of all tina-data types

### Phase 3: React Frontend

- Vite + React + TypeScript + Tailwind scaffold
- TypeScript types matching Rust schemas
- WebSocket hook with reconnection
- OrchestrationList component
- OrchestrationDetail component (phases, tasks, team panels)
- StatusBar component
- Vite proxy config for development

### Phase 4: End-to-End Validation

- Run tina-harness scenario to generate known state
- Start tina-web backend
- Use Playwright to navigate, screenshot, read DOM
- Compare harness expected.json vs raw files vs UI display
- Fix data layer bugs found during validation
- Document any tina-harness issues discovered

## Success Metrics

- Web UI displays all orchestrations that exist in `~/.claude/teams/`
- No stale orchestrations shown that don't exist on disk
- Task counts in UI match task files in `~/.claude/tasks/{team}/`
- Phase status in UI matches `supervisor-state.json` content
- WebSocket updates reach the UI within 2 seconds of file changes
- Playwright can read and verify all displayed data programmatically
- tina-harness scenarios produce expected state on disk
- Three-way comparison (expected vs disk vs UI) passes for all harness scenarios

## Dev Workflow

```bash
# Terminal 1: Rust backend
cargo run -p tina-web

# Terminal 2: React dev server (with hot reload)
cd tina-web/frontend && npm run dev

# Vite proxies /api and /ws to localhost:3100
# Open http://localhost:5173 for dev, or localhost:3100 for production build
```

## Non-Goals (v1)

- Terminal embedding or agent log viewing
- Sending commands to agents
- Plan viewing with syntax highlighting
- Git commit stream or diff viewing
- Project/story management
- Any write operations (UI is read-only for monitoring)

## Architectural Context

**Critical: Two conflicting data loading paths exist.**

tina-monitor has two independent ways to discover orchestrations:

1. `data/mod.rs:50-88` — `DataSource::list_orchestrations()` discovers via `~/.claude/tina-sessions/` (session lookup files). Has fixture support. Returns `OrchestrationSummary`.
2. `data/discovery.rs:113-127` — `find_orchestrations()` discovers via `~/.claude/teams/` (team directory enumeration). No fixture support. Returns `Orchestration`.

These return **different struct types** with different fields:
- `data/mod.rs:19-25` — `Orchestration { state, orchestrator_team, phase_team, tasks }`
- `data/discovery.rs:12-28` — `Orchestration { team_name, title, feature_name, cwd, status, ... }`

The tina-data extraction must reconcile these into a single discovery path. The `discovery.rs` approach (team enumeration) is what the TUI uses for its main view, so that's likely the one to keep. The `DataSource` approach may have value for its fixture support pattern.

**Critical: Duplicate OrchestrationStatus enums.**

- `tina-session/src/state/schema.rs:113-121` — Simple enum: `Planning | Executing | Reviewing | Complete | Blocked`
- `tina-monitor/src/data/discovery.rs:103-110` — Data-carrying enum: `Executing { phase } | Blocked { phase, reason } | Complete | Idle`

These have the same name but are fundamentally different types. The discovery.rs version derives status from task states at runtime (`discovery.rs:221-253`), while the schema.rs version is what gets persisted in `supervisor-state.json`. tina-data needs to either consolidate these or make the naming unambiguous (e.g., `DerivedOrchestrationStatus` vs `OrchestrationStatus`).

**Hardcoded paths in all data modules.**

Every data function uses `dirs::home_dir()` directly:
- `data/teams.rs:9-14` — `teams_dir()` hardcodes `~/.claude/teams`
- `data/tasks.rs:10-15` — `tasks_dir()` hardcodes `~/.claude/tasks`
- `data/tina_state.rs:9-22` — paths hardcoded inline
- `data/discovery.rs:131-139` — `load_session_lookup()` hardcodes `~/.claude/tina-sessions`

The `DataSource` in `data/mod.rs:36-42` solves this with configurable paths but isn't used by `discovery.rs`. During extraction to tina-data, consider making base paths injectable so the web backend can configure them and tests can use temp directories.

**Two watcher implementations.**

- `tina-monitor/src/data/watcher.rs` — Watches `~/.claude/teams/` and `~/.claude/tasks/`
- `tina-monitor/src/watcher.rs` — Need to check if this is a duplicate or different

Only one should move to tina-data. The `data/watcher.rs` version is the right one — it monitors the directories that matter for orchestration data.

**Harness doesn't validate monitoring data.**

`tina-harness/src/commands/run.rs:279-317` validates orchestration outcomes (phases completed, final status, file changes) but not monitoring-layer data. The harness needs a new capability: write known state to `~/.claude/` locations, then verify what tina-data reads back matches expectations. This is the gap that makes the "three-way comparison" possible.

**Patterns to follow:**

- File watcher with channel events: `tina-monitor/src/data/watcher.rs:9-13` — `WatchEvent` enum, `FileWatcher` struct with receiver
- Task loading with numeric sort: `tina-monitor/src/data/tasks.rs:37-41`
- Orchestration discovery flow: `tina-monitor/src/data/discovery.rs:162-219` — `try_load_orchestration()` is the main entry point
- Schema types with serde rename: `tina-session/src/state/schema.rs:27-56` — camelCase JSON field names via `#[serde(rename)]`

**Code to reuse:**

- `tina-session/src/state/schema.rs` — All canonical types (SupervisorState, PhaseState, Team, Agent, Task, etc.)
- `tina-monitor/src/data/discovery.rs` — Orchestration discovery and status derivation
- `tina-monitor/src/data/teams.rs` — Team loading and worktree matching
- `tina-monitor/src/data/tasks.rs` — Task loading, numeric sorting, TaskSummary
- `tina-monitor/src/data/tina_state.rs` — Supervisor state and context metrics loading
- `tina-monitor/src/data/watcher.rs` — File watcher for auto-refresh

**Anti-patterns to fix during extraction:**

- Don't maintain two Orchestration structs — consolidate into one
- Don't maintain two OrchestrationStatus enums — make naming unambiguous
- Don't hardcode `dirs::home_dir()` in every function — make base paths configurable
- Don't silently swallow errors in `find_orchestrations()` (`discovery.rs:121-122`) — at minimum log them

**Integration points:**

- New workspace members: `tina-data`, `tina-web`
- Dependency chain: `tina-session` <- `tina-data` <- `tina-monitor` / `tina-web`
- File locations: `~/.claude/teams/`, `~/.claude/tasks/`, `~/.claude/tina-sessions/`, `{worktree}/.claude/tina/`
- Port: `localhost:3100` (fixed, no config needed for v1)
