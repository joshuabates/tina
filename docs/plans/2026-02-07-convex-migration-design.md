# Convex Migration Design

## Problem

Tina's data layer is local-only: SQLite on disk, file watchers, and an Axum HTTP server. This creates three problems:

1. **No mobile access** — monitoring and interacting with orchestrations requires being at the laptop running tina-web.
2. **No multi-laptop view** — orchestrations running on different machines are invisible to each other. No unified dashboard.
3. **No remote interaction** — approving plans, sending messages to agents, and operator controls (pause/resume/retry) require local access.

## Solution

Replace the local data layer with Convex as the primary datastore. Each laptop runs a daemon that syncs local state to Convex and receives inbound actions. The React frontend talks directly to Convex — no Axum backend needed.

## Assumptions

- Single operator (one user account).
- macOS-only daemon (launchd).

## Auth & Access Control (Single User)

Even with a single operator, all Convex access must be authenticated and scoped.

- **UI auth** — the React app requires a logged-in user (the operator).
- **Daemon auth** — each daemon uses a per-node token stored in `~/.config/tina/config.toml`.

**Access rules (enforced inside Convex queries/mutations):**

- All reads require the operator identity or a valid node token.
- `submitAction` is UI-only (operator).
- `pendingActions`, `claimAction`, `completeAction`, `heartbeat`, `registerNode` require a valid node token.
- Node-scoped calls can only operate on their own `nodeId`.

## Success Metrics

- All active orchestrations across all laptops visible in a single dashboard
- Operator controls (pause/resume/retry) functional from any browser/device
- Plan approval and rejection functional from any browser/device
- Real-time updates visible within 1 second of state change (vs current 2-second polling)
- tina-web Rust backend fully removed (0 lines of Axum code)
- SQLite fully removed from tina-session and tina-data

## Architecture

### Component Changes

| Component | Before | After |
|-----------|--------|-------|
| **tina-data** | File discovery + SQLite re-exports | Convex Rust SDK wrapper + shared types |
| **tina-web** | Axum backend + React frontend in `frontend/` | React-only app at top level, talks directly to Convex |
| **tina-session** | Writes supervisor-state.json + SQLite, has embedded daemon | Writes supervisor-state.json + Convex (via tina-data), no daemon |
| **tina-daemon** | *(new)* | Always-on launchd service per laptop |
| **convex/** | *(new)* | Top-level directory with TypeScript schema + functions |
| **SQLite** | Primary datastore | Removed |
| **Axum backend** | API server + WebSocket | Removed |

### Data Flow

```
Phone/Browser
    |  (Convex React SDK - real-time subscriptions + mutations)
    v
Convex Cloud
    ^  (Convex Rust SDK - subscriptions + mutations)
    |
tina-daemon (per laptop)
    |  watches ~/.claude/teams/ and ~/.claude/tasks/
    |  syncs changes up to Convex
    |  receives inbound actions, dispatches locally
    v
tina-session (writes supervisor-state.json, calls tina-data for Convex writes)
```

## Convex Schema & Functions

### Directory Structure

```
convex/
  schema.ts           -- table definitions
  orchestrations.ts   -- queries/mutations for orchestrations
  phases.ts           -- queries/mutations for phases
  tasks.ts            -- queries/mutations for task events
  events.ts           -- queries/mutations for orchestration events
  nodes.ts            -- laptop registration/heartbeat
  actions.ts          -- inbound actions (approve, message, pause, etc.)
```

### Tables

**nodes** — laptop registration and presence.
- `name` (string) — machine name
- `os` (string) — operating system
- `status` (string) — "online" | "offline"
- `lastHeartbeat` (number) — timestamp of last heartbeat
- `registeredAt` (number) — first registration timestamp
- `authTokenHash` (string) — hash of the per-node daemon token

**orchestrations** — mirrors current SQLite table, plus node tracking.
- `nodeId` (id, references nodes) — which laptop owns this orchestration
- `featureName` (string)
- `designDocPath` (string)
- `branch` (string)
- `worktreePath` (optional string)
- `totalPhases` (number)
- `currentPhase` (number)
- `status` (string) — "planning" | "executing" | "reviewing" | "complete" | "blocked"
- `startedAt` (string) — ISO 8601
- `completedAt` (optional string)
- `totalElapsedMins` (optional number)

**phases** — per-phase timing and status.
- `orchestrationId` (id, references orchestrations)
- `phaseNumber` (string) — "1", "2", "1.5" (remediation)
- `status` (string) — "planning" | "planned" | "executing" | "reviewing" | "complete" | "blocked"
- `planPath` (optional string)
- `gitRange` (optional string)
- `planningMins` (optional number)
- `executionMins` (optional number)
- `reviewMins` (optional number)
- `startedAt` (optional string)
- `completedAt` (optional string)

**taskEvents** — append-only event log of task state changes.
- `orchestrationId` (id, references orchestrations)
- `phaseNumber` (optional string)
- `taskId` (string)
- `subject` (string)
- `description` (optional string)
- `status` (string) — "pending" | "in_progress" | "completed"
- `owner` (optional string)
- `blockedBy` (optional string) — JSON array
- `metadata` (optional string) — JSON object
- `recordedAt` (string)

**orchestrationEvents** — event log (phase_started, phase_completed, etc.).
- `orchestrationId` (id, references orchestrations)
- `phaseNumber` (optional string)
- `eventType` (string)
- `source` (string)
- `summary` (string)
- `detail` (optional string)
- `recordedAt` (string)

**teamMembers** — agent participation per orchestration/phase.
- `orchestrationId` (id, references orchestrations)
- `phaseNumber` (string)
- `agentName` (string)
- `agentType` (optional string)
- `model` (optional string)
- `joinedAt` (optional string)
- `recordedAt` (string)

**inboundActions** — queue of actions from phone/browser to laptops.
- `nodeId` (id, references nodes) — target laptop
- `orchestrationId` (id, references orchestrations)
- `type` (string) — "approve_plan" | "reject_plan" | "pause" | "resume" | "retry" | "send_message"
- `payload` (string) — JSON object with type-specific data
- `status` (string) — "pending" | "claimed" | "completed" | "failed"
- `result` (optional string) — outcome after execution
- `createdAt` (number)
- `claimedAt` (optional number)
- `completedAt` (optional number)

### Functions

**Queries (reactive, auto-update on subscriptions):**
- `listNodes` — all registered nodes with online/offline status
- `listOrchestrations` — all orchestrations with node info
- `getOrchestrationDetail` — single orchestration with phases, latest tasks, team members
- `listEvents` — orchestration events, supports `since` for incremental loading
- `pendingActions` — actions pending for a specific node (daemon subscribes to this)

**Mutations (writes):**
- `registerNode` / `heartbeat` — node lifecycle
- `upsertOrchestration` — create or update orchestration record
- `upsertPhase` — create or update phase record
- `recordTaskEvent` — append task event
- `recordEvent` — append orchestration event
- `upsertTeamMember` — create or update team member
- `submitAction` — phone/browser submits an action
- `claimAction` / `completeAction` — daemon claims and completes actions

**Notes:**

- Node online/offline is computed from `lastHeartbeat` at query time (e.g., `now - lastHeartbeat < 60s`).
- `claimAction` is atomic: only transitions `pending -> claimed` if still pending; otherwise returns a conflict.

## tina-daemon

New crate. Always-on launchd service, one per laptop.

### Responsibilities

**1. Node registration & heartbeat**
- On startup, registers with Convex via `registerNode` mutation (machine name, OS, timestamp).
- Sends heartbeat every 30 seconds.
- If heartbeat stops, Convex marks the node as offline after ~60 seconds.

**2. Outbound sync (local to Convex)**
- Watches `~/.claude/teams/` and `~/.claude/tasks/` using the `notify` crate.
- On file changes, diffs current state against what's in Convex, pushes new task events and team member updates.
- Watches for supervisor-state.json changes across all active worktrees (discovered via session lookups in `~/.claude/tina-sessions/`).
- Upserts orchestration and phase records when state advances.

**3. Inbound actions (Convex to local)**
- Subscribes to `pendingActions` query filtered by its node ID via the Convex Rust SDK.
- When an action arrives, claims it and dispatches:
  - `approve_plan` — sends plan approval message to the agent
  - `reject_plan` — sends plan rejection with feedback
  - `pause` — runs `tina-session orchestrate advance {feature} {phase} error --issues "paused by operator"`
  - `resume` — runs `tina-session orchestrate next {feature}`
  - `retry` — runs `tina-session orchestrate advance {feature} {phase} retry`
  - `send_message` — TBD (see open questions)
- Marks action as completed with result.

### Lifecycle

Installed as a macOS launchd service at `~/Library/LaunchAgents/dev.tina.daemon.plist`. Starts on login, runs forever, restarts on crash.

### Configuration

Reads Convex deployment URL and auth from `~/.config/tina/config.toml` or environment variables.
Per-node daemon token is stored in `~/.config/tina/config.toml` and validated against `nodes.authTokenHash`.

## tina-data Changes

**Role shifts to:** Convex Rust SDK wrapper + shared types.

### What it provides

- **Shared types** — `Orchestration`, `Phase`, `TaskEvent`, `OrchestrationEvent`, `TeamMember`, `Node`, `InboundAction`. Serde-compatible structs used by tina-daemon and tina-session.
- **Convex client wrapper** — typed methods over the `convex` crate:
  - `upsert_orchestration(&self, orch: &Orchestration)`
  - `record_task_event(&self, event: &TaskEvent)`
  - `record_event(&self, event: &OrchestrationEvent)`
  - `subscribe_pending_actions(&self, node_id: &str) -> Stream<Vec<InboundAction>>`
  - `claim_action(&self, action_id: &str)`
  - `complete_action(&self, action_id: &str, result: &str)`
  - `register_node(&self, name: &str, os: &str)`
  - `heartbeat(&self, node_id: &str)`
- **Local file reading** — reads supervisor-state.json and session lookups from disk (daemon needs this before pushing to Convex).

### What gets deleted

- `discovery.rs` — file-based orchestration discovery
- `teams.rs` — team config reading (moves to tina-daemon)
- `tasks.rs` — task file reading (moves to tina-daemon)
- `watcher.rs` — file watcher (moves to tina-daemon)
- `db.rs` — SQLite re-exports

### Dependencies

- Remove: `rusqlite`, `notify`
- Add: `convex`

## tina-session Changes

### What stays

- State machine logic (`state/orchestrate.rs`) — advance/transition logic unchanged.
- Supervisor-state.json — still written to `{worktree}/.claude/tina/supervisor-state.json`.
- Session lookups (`~/.claude/tina-sessions/{feature}.json`) — daemon uses these for discovery.
- `init` command — creates worktree, writes supervisor-state.json, writes session lookup.
- `orchestrate advance` / `orchestrate next` commands — local control interface.

### What changes

- **`init` writes to Convex instead of SQLite** — calls `tina_data::upsert_orchestration()` to register the new orchestration.
- **State advances notify Convex** — after `state.save()`, calls `tina_data::upsert_orchestration()` to push updated status/phase.
- **Event recording goes to Convex** — `record_event()` calls go through tina-data.

### What gets deleted

- `db/` module (all files: mod.rs, migrations.rs, orchestrations.rs, phases.rs, task_events.rs, orchestration_events.rs, team_members.rs, queries.rs, projects.rs)
- `daemon/sync.rs` — syncing moves to tina-daemon
- `rusqlite` dependency

## tina-web Changes

### Structural

- Un-nest: move `tina-web/frontend/*` to `tina-web/` root.
- Delete all Rust source: `tina-web/src/*.rs`, `Cargo.toml`, `tests/`.
- Remove from Cargo workspace.
- tina-web becomes a pure Vite + React + TypeScript project.

### Data layer swap

- Remove all `fetch`/REST API calls and WebSocket client code.
- Replace with Convex React SDK (`useQuery`, `useMutation`).
- Every list/detail view becomes a reactive subscription — auto-updates when Convex state changes.
- Operator controls (pause/resume/retry) become `useMutation` calls to `submitAction`.

### Dependencies

- Remove: none (frontend deps stay)
- Add: `convex` npm package

## Deletions Summary

**tina-web Rust backend (entire thing):**
- `tina-web/src/main.rs`, `api.rs`, `state.rs`, `ws.rs`, `lib.rs`
- `tina-web/Cargo.toml`
- `tina-web/tests/`

**tina-session database layer:**
- `tina-session/src/db/` (all files)
- `tina-session/src/daemon/sync.rs`

**tina-data file-based discovery:**
- `tina-data/src/discovery.rs`, `teams.rs`, `tasks.rs`, `watcher.rs`, `db.rs`, `tina_state.rs`

**Dependencies removed:**
- `rusqlite` (from tina-session and tina-data)
- `axum`, `tower`, `tower-http` (from tina-web)
- `notify` (from tina-data, moves to tina-daemon)

**Dependencies added:**
- `convex` Rust crate (to tina-data and tina-daemon)
- `convex` npm package (to tina-web)

## Prerequisites

- Convex account and project created at [convex.dev](https://www.convex.dev)
- Deployment URL available for daemon configuration

## Event Retention & Pagination

- **Retention:** keep task and orchestration events forever initially.
- **Pagination:** all event queries must be paginated (`limit` + `cursor` or `since`) and indexed by `orchestrationId` and `recordedAt`.

## Scope Decisions

- **File sync**: Use `notify` crate file watchers (not Claude Code hooks). Proven pattern already in `tina-data/src/watcher.rs`.
- **Inbound message delivery**: Deferred to a future design. This migration covers outbound sync and operator controls via `tina-session orchestrate advance/next` CLI commands only.
- **tina-monitor**: Switches to Convex (reads from Convex instead of local files/SQLite). Included in scope.

## Architectural Context

**Patterns to follow:**
- DataSource fixture pattern: `tina-data/src/lib.rs:46-61` — constructor takes optional fixture path, all methods resolve against it. Replicate for ConvexClient wrapper (test with mock/fixture, prod with real client).
- File watcher setup: `tina-data/src/watcher.rs` — current `notify` usage. Daemon inherits this pattern.
- State machine: `tina-session/src/state/orchestrate.rs` — `next_action()` / `advance_state()` are pure functions. Keep them unchanged; only change the persistence callsites.
- SQLite test pattern: `tina-session/src/db/mod.rs:42-47` — `test_db()` uses in-memory SQLite. Convex wrapper tests should use a similar fixture/mock approach.
- Serde conventions: all types use `#[serde(rename_all = "snake_case")]` for enums. Convex schema field names should match (snake_case).
- Frontend hooks pattern: `tina-web/frontend/src/hooks/useOrchestrations.ts` — WebSocket subscription with auto-reconnect. Replace with Convex `useQuery` subscriptions.

**Code to reuse:**
- `tina-session/src/state/schema.rs` — SupervisorState, PhaseState, OrchestrationStatus, etc. These types stay as-is.
- `tina-session/src/session/lookup.rs` — SessionLookup. Daemon uses this for worktree discovery.
- `tina-session/src/state/orchestrate.rs` — State machine logic. Untouched by migration.
- `tina-session/src/state/transitions.rs` — Transition logic. Untouched.
- `tina-web/frontend/src/types.ts` — TypeScript interfaces. Adapt for Convex document types.
- `tina-web/frontend/src/components/` — All React components stay. Only data-fetching changes.

**Anti-patterns:**
- Don't put Convex client construction in every crate — centralize in tina-data, other crates call through it.
- Don't mix file-based discovery with Convex reads in the same code path — daemon reads files and writes Convex; consumers read Convex only.
- Don't use `tina-data` as a dependency for tina-daemon's file watching — daemon should own its file watchers directly (tina-data becomes Convex-only after migration).

**Integration:**
- Daemon entry: new crate `tina-daemon/`, installed via `cargo install --path tina-daemon`
- Convex entry: new top-level `convex/` directory with `npx convex dev` workflow
- tina-session writes: `commands/init.rs:L5-L10` and `state/orchestrate.rs` — add Convex writes alongside supervisor-state.json writes
- tina-web restructure: move `tina-web/frontend/*` to `tina-web/` root, delete Rust source
- tina-monitor: replace `tina-data::DataSource` usage with Convex client reads
- Cargo workspace: remove `tina-web` member, add `tina-daemon` member

**Dependency changes:**
- Add: `convex` crate (tina-data, tina-daemon), `convex` npm package (tina-web)
- Remove: `rusqlite` (tina-session, tina-data, tina-web), `axum`/`tower`/`tower-http` (tina-web), `notify` (tina-data, moves to tina-daemon)
- Keep: `notify` in tina-session (daemon watcher for supervisor-state.json changes)

## Phase 1: Convex Schema & Backend Functions

Set up the Convex project and define all tables and server-side functions. No Rust or React changes yet — this phase is purely TypeScript in the new `convex/` directory.

**Delivers:**
- `convex/` directory with schema, queries, mutations
- All tables defined: nodes, orchestrations, phases, taskEvents, orchestrationEvents, teamMembers, inboundActions
- All queries: listNodes, listOrchestrations, getOrchestrationDetail, listEvents, pendingActions
- All mutations: registerNode, heartbeat, upsertOrchestration, upsertPhase, recordTaskEvent, recordEvent, upsertTeamMember, submitAction, claimAction, completeAction
- `npx convex dev` runs successfully against a dev deployment
- Index definitions for paginated queries (orchestrationId + recordedAt)

**Does NOT touch:** Any Rust crate or React code.

## Phase 2: tina-data Convex Client Wrapper

Replace tina-data's file-based discovery with a Convex Rust SDK wrapper. tina-data becomes the shared typed interface to Convex for all Rust crates.

**Delivers:**
- `convex` crate added to tina-data dependencies
- New `convex_client.rs` module with typed methods: `upsert_orchestration`, `record_task_event`, `record_event`, `upsert_phase`, `subscribe_pending_actions`, `claim_action`, `complete_action`, `register_node`, `heartbeat`
- Shared Convex-compatible types (mirroring schema from Phase 1)
- Delete: `discovery.rs`, `teams.rs`, `tasks.rs`, `watcher.rs`, `db.rs`, `tina_state.rs`
- Remove `rusqlite` and `notify` dependencies
- Fixture/mock testing for Convex client wrapper
- `cargo build` succeeds for tina-data

**Does NOT touch:** tina-session, tina-web, tina-monitor (they may temporarily fail to compile — that's fine, fixed in later phases).

## Phase 3: tina-daemon (New Crate)

Create the always-on daemon that bridges local filesystem state to Convex.

**Delivers:**
- New `tina-daemon/` crate added to workspace
- Node registration and heartbeat (30s interval)
- File watchers on `~/.claude/teams/`, `~/.claude/tasks/`, and supervisor-state.json files
- Outbound sync: file changes → diff → Convex mutations via tina-data
- Inbound actions: subscribe to `pendingActions`, dispatch via `tina-session orchestrate advance/next` CLI
- launchd plist template at `tina-daemon/dev.tina.daemon.plist`
- Config reading from `~/.config/tina/config.toml`
- `cargo build` and `cargo test` pass for tina-daemon

**Does NOT touch:** tina-session database layer (still writes SQLite), tina-web, tina-monitor.

## Phase 4: tina-session Convex Integration & SQLite Removal

Switch tina-session from SQLite to Convex writes. The daemon handles reads; tina-session only needs to write.

**Delivers:**
- `init` command writes to Convex (via tina-data) instead of SQLite
- State advances call `tina_data::upsert_orchestration()` after `state.save()`
- Event recording goes through tina-data to Convex
- Delete: entire `db/` module (mod.rs, migrations.rs, orchestrations.rs, phases.rs, task_events.rs, orchestration_events.rs, team_members.rs, queries.rs, projects.rs)
- Delete: `daemon/sync.rs`
- Remove `rusqlite` dependency
- `cargo build` and `cargo test` pass for tina-session
- All existing state machine tests still pass (they don't touch db)

## Phase 5: tina-web Frontend Migration

Replace the Axum backend + REST/WebSocket data layer with direct Convex React SDK usage.

**Delivers:**
- Move `tina-web/frontend/*` to `tina-web/` root
- Delete all Rust source: `src/main.rs`, `api.rs`, `state.rs`, `ws.rs`, `lib.rs`, `Cargo.toml`, `tests/`
- Remove `tina-web` from Cargo workspace
- Add `convex` npm package
- Replace `api.ts` fetch calls with Convex `useQuery` / `useMutation`
- Replace `useOrchestrations.ts` WebSocket hook with Convex reactive subscriptions
- Operator controls (pause/resume/retry) become `useMutation` calls to `submitAction`
- All existing React components preserved (only data-fetching props change)
- `npm run build` succeeds, app loads and shows data from Convex

## Phase 6: tina-monitor Convex Migration

Switch tina-monitor from local file/SQLite reads to Convex reads via tina-data.

**Delivers:**
- Replace `DataSource` usage with Convex client reads from tina-data
- Remove direct file reading for orchestration data (keep any local-only features like log viewing)
- Remove `rusqlite` and `notify` dependencies if no longer needed
- `cargo build` and `cargo test` pass for tina-monitor
- TUI displays orchestration data from Convex
