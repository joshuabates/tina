# Convex Migration Design

## Problem

Tina's data layer is local-only: SQLite on disk, file watchers, and an Axum HTTP server. This creates three problems:

1. **No mobile access** — monitoring and interacting with orchestrations requires being at the laptop running tina-web.
2. **No multi-laptop view** — orchestrations running on different machines are invisible to each other. No unified dashboard.
3. **No remote interaction** — approving plans, sending messages to agents, and operator controls (pause/resume/retry) require local access.

## Solution

Replace the local data layer with Convex as the primary datastore. Each laptop runs a daemon that syncs local state to Convex and receives inbound actions. The React frontend talks directly to Convex — no Axum backend needed.

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

## TBDs

### 1. Inbound message delivery to running Claude sessions

How the daemon delivers a message (approval, rejection, chat message) into a running Claude TUI process. The daemon can execute CLI commands (`tina-session orchestrate advance`), but sending an arbitrary message into an active Claude Code session has no established mechanism.

Needs investigation: Claude Code hooks, tmux send-keys, file-based inbox, or other approaches.

### 2. Claude-owned file sync mechanism

Current plan: file watchers (notify crate) detect changes to `~/.claude/teams/` and `~/.claude/tasks/`, daemon syncs to Convex.

Alternative: Claude Code hooks that fire on tool calls could push state directly to Convex, eliminating the watcher. Hooks are appealing (event-driven, no polling) but may be fragile or limited in what context they provide.

Leaning toward file watchers for reliability. Worth spiking hooks to see if they're viable.
