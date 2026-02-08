# Phase 3: tina-daemon (New Crate)

## Goal

Create the `tina-daemon` crate -- an always-on service that bridges local filesystem state to Convex. It handles node registration, heartbeat, outbound sync (local files to Convex), and inbound action dispatch (Convex to local CLI).

## Prerequisites

- Phase 1 complete: Convex schema and functions deployed (`convex/` directory)
- Phase 2 complete: `tina-data` has `TinaConvexClient` with all typed Convex methods and shared types

## Scope

**In scope:**
- New `tina-daemon/` crate (standalone, not a workspace member -- matches existing crate pattern)
- Node registration and 30-second heartbeat loop
- File watchers on `~/.claude/teams/`, `~/.claude/tasks/`, and supervisor-state.json files
- Outbound sync: detect file changes, diff against local cache, push to Convex via `tina-data`
- Inbound actions: subscribe to `pendingActions`, claim and dispatch via `tina-session` CLI
- Config reading from `~/.config/tina/config.toml`
- launchd plist template
- Tests for all sync/diff logic

**Out of scope:**
- tina-session database changes (Phase 4)
- tina-web frontend changes (Phase 5)
- tina-monitor changes (Phase 6)
- `send_message` inbound action type (deferred per design doc)

## Implementation Steps

### Step 1: Crate scaffold and config

Create `tina-daemon/` with:

**`tina-daemon/Cargo.toml`:**
```toml
[package]
name = "tina-daemon"
version = "0.1.0"
edition = "2021"
description = "Always-on daemon that syncs local orchestration state to Convex"

[dependencies]
tina-data = { path = "../tina-data" }
tina-session = { path = "../tina-session" }

# Async runtime
tokio = { version = "1", features = ["full"] }

# File watching
notify = "6"

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"

# Time
chrono = { version = "0.4", features = ["serde"] }

# Error handling
anyhow = "1"

# CLI
clap = { version = "4", features = ["derive"] }

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Paths
dirs = "5"

# Auth token hashing
sha2 = "0.10"

# Signal handling
tokio-util = "0.7"

[dev-dependencies]
tempfile = "3"
```

**`tina-daemon/src/config.rs`** -- reads `~/.config/tina/config.toml`:
```rust
pub struct DaemonConfig {
    pub convex_url: String,
    pub auth_token: String,
    pub node_name: Option<String>,  // defaults to hostname
}
```

Config file format:
```toml
convex_url = "https://your-deployment.convex.cloud"
auth_token = "node-secret-token-here"
node_name = "macbook-pro"  # optional, defaults to hostname
```

Also supports env vars: `TINA_CONVEX_URL`, `TINA_AUTH_TOKEN`, `TINA_NODE_NAME` (env takes precedence).

**Test:** Config loads from file, env vars override file values, missing file with env vars works, missing everything errors.

### Step 2: Node registration and heartbeat

**`tina-daemon/src/heartbeat.rs`:**

- On startup, compute `sha256(auth_token)` for the `authTokenHash` field
- Call `tina_data::TinaConvexClient::register_node()` with machine name, OS, and token hash
- Store the returned `node_id` for use in all subsequent calls
- Spawn a tokio task that calls `heartbeat(node_id)` every 30 seconds
- If heartbeat fails, log the error and retry on next interval (don't crash)

**Test:** Unit test that `sha256` hashing produces consistent output. Integration logic tested by checking that heartbeat task can be started/stopped cleanly using `CancellationToken`.

### Step 3: File watchers

**`tina-daemon/src/watcher.rs`:**

Reuse the pattern from `tina-session/src/daemon/watcher.rs` (DaemonWatcher) but extend to also watch supervisor-state.json files.

Three watch targets:
1. `~/.claude/teams/` -- recursive, detects team config changes
2. `~/.claude/tasks/` -- recursive, detects task file changes
3. Supervisor-state.json files -- discovered via `SessionLookup::list_all()`, watches each `{worktree}/.claude/tina/supervisor-state.json`

The watcher uses `notify` with an async `tokio::sync::mpsc` channel (not `std::sync::mpsc` as in the existing code -- the daemon is fully async).

Events are categorized:
```rust
pub enum WatchTarget {
    Teams,
    Tasks,
    SupervisorState { feature: String },
}
```

Periodically (every 60s) re-scan `SessionLookup::list_all()` to discover new worktrees and add them to the watch set.

**Test:** Watcher detects file creation in teams dir. Watcher detects file modification. Watcher categorizes events correctly.

### Step 4: Outbound sync -- teams and tasks

**`tina-daemon/src/sync.rs`:**

Port and adapt `tina-session/src/daemon/sync.rs` to use Convex (via `tina-data`) instead of SQLite.

The sync module maintains an in-memory cache of what has been sent to Convex, to avoid redundant writes.

**Team sync:**
- Read team configs from `~/.claude/teams/{name}/config.json`
- For each team, find the associated orchestration (reuse the `find_orchestration_for_team` logic from the existing sync.rs -- match by feature name suffix or worktree path)
- For each team member, call `tina_data::TinaConvexClient::upsert_team_member()`
- Cache: store `(orchestration_id, phase_number, agent_name) -> last_recorded_at` to avoid duplicate upserts

**Task sync:**
- Read task files from `~/.claude/tasks/{lead_session_id}/`
- For each task, compare against cached state (subject, status, owner)
- If changed, call `tina_data::TinaConvexClient::record_task_event()`
- Cache: store `(orchestration_id, task_id) -> (status, subject, owner)` to detect changes

**Orchestration association:**
The daemon needs to map teams/tasks to Convex orchestration IDs. On startup and periodically, it fetches orchestration records from Convex (or reads supervisor-state.json locally) to build a mapping of `feature_name -> convex_orchestration_id`. This mapping is refreshed when supervisor-state changes are detected.

Note: The daemon writes to Convex using its `node_id`. When creating orchestration records, the `node_id` field comes from the daemon's registration.

**Test:**
- `sync_team_members` correctly builds `TeamMemberRecord` from a `Team` struct
- `sync_tasks` detects status changes and builds `TaskEventRecord`
- Cache prevents duplicate writes (same state -> no call)
- Cache detects changes (status change -> new call)

### Step 5: Outbound sync -- supervisor state

**`tina-daemon/src/sync.rs`** (continued):

When supervisor-state.json changes:
- Parse the `SupervisorState` from the file (using `tina_data::tina_state::load_supervisor_state()`)
- Call `tina_data::TinaConvexClient::upsert_orchestration()` with updated fields (status, current_phase, etc.)
- For each phase in `state.phases`, call `tina_data::TinaConvexClient::upsert_phase()` with timing/status data
- Record orchestration events for state transitions (phase started, phase completed, etc.) via `record_event()`

**Mapping SupervisorState to Convex records:**
```
SupervisorState.feature        -> OrchestrationRecord.feature_name
SupervisorState.design_doc     -> OrchestrationRecord.design_doc_path
SupervisorState.branch         -> OrchestrationRecord.branch
SupervisorState.worktree_path  -> OrchestrationRecord.worktree_path
SupervisorState.total_phases   -> OrchestrationRecord.total_phases
SupervisorState.current_phase  -> OrchestrationRecord.current_phase
SupervisorState.status         -> OrchestrationRecord.status (snake_case string)
SupervisorState.orchestration_started_at -> OrchestrationRecord.started_at (ISO 8601)
SupervisorState.timing.total_elapsed_mins -> OrchestrationRecord.total_elapsed_mins
```

Phase mapping:
```
PhaseState.status              -> PhaseRecord.status
PhaseState.plan_path           -> PhaseRecord.plan_path
PhaseState.git_range           -> PhaseRecord.git_range
PhaseState.breakdown.*_mins    -> PhaseRecord.*_mins (as f64)
PhaseState.planning_started_at -> PhaseRecord.started_at
PhaseState.completed_at        -> PhaseRecord.completed_at
```

**Test:**
- `supervisor_state_to_orchestration_record` correctly maps all fields
- `phase_state_to_phase_record` correctly maps all fields including optional ones
- Status enum values map to correct snake_case strings

### Step 6: Inbound action dispatch

**`tina-daemon/src/actions.rs`:**

Subscribe to `pendingActions` query filtered by the daemon's `node_id`. When new actions arrive:

1. Claim the action via `tina_data::TinaConvexClient::claim_action()`
2. If claim fails (already claimed), skip
3. Dispatch based on action type:

| Action type     | Dispatch command                                                              |
|-----------------|-------------------------------------------------------------------------------|
| `approve_plan`  | `tina-session orchestrate advance {feature} {phase} pass`                     |
| `reject_plan`   | `tina-session orchestrate advance {feature} {phase} gaps --issues {feedback}` |
| `pause`         | `tina-session orchestrate advance {feature} {phase} error --issues "paused"`  |
| `resume`        | `tina-session orchestrate next {feature}`                                     |
| `retry`         | `tina-session orchestrate advance {feature} {phase} retry`                    |

4. After dispatch, call `complete_action(action_id, result, success)`

The feature name and phase number are extracted from the action's `payload` JSON and the associated orchestration record.

**Test:**
- `dispatch_action` builds correct CLI command for each action type
- Payload parsing extracts feature/phase correctly
- Failed claim results in skip (no dispatch)

### Step 7: Main loop

**`tina-daemon/src/main.rs`:**

```
CLI: tina-daemon [--config PATH]
```

Main loop (all async with tokio):
1. Load config
2. Connect to Convex (`TinaConvexClient::new(convex_url)`)
3. Register node, store node_id
4. Start heartbeat task (30s interval)
5. Start file watchers (teams, tasks, supervisor-state)
6. Subscribe to pending actions
7. Main select loop:
   - File change event -> trigger appropriate sync
   - Pending action event -> dispatch action
   - Shutdown signal (SIGTERM/SIGINT) -> clean exit

Use `tokio::select!` for the main loop, `CancellationToken` for graceful shutdown.

**Test:** Main loop starts and stops cleanly with cancellation token. (Full integration requires a live Convex deployment, so keep unit tests focused on individual components.)

### Step 8: launchd plist

**`tina-daemon/dev.tina.daemon.plist`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>dev.tina.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/tina-daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/tina-daemon.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/tina-daemon.stderr.log</string>
</dict>
</plist>
```

Installation: `cp tina-daemon/dev.tina.daemon.plist ~/Library/LaunchAgents/` then `launchctl load ~/Library/LaunchAgents/dev.tina.daemon.plist`

No test needed for the plist itself.

## Module Structure

```
tina-daemon/
  Cargo.toml
  dev.tina.daemon.plist
  src/
    main.rs           -- CLI entry point, main async loop
    config.rs         -- Config loading (file + env vars)
    heartbeat.rs      -- Node registration and heartbeat task
    watcher.rs        -- File watchers for teams/tasks/supervisor-state
    sync.rs           -- Outbound sync logic (files -> Convex)
    actions.rs        -- Inbound action dispatch (Convex -> CLI)
    lib.rs            -- Module declarations
```

## Dependencies on Existing Code

- `tina-data`: `TinaConvexClient` (all mutation/subscription methods), shared types (`OrchestrationRecord`, `PhaseRecord`, `TaskEventRecord`, etc.), `tina_state::load_supervisor_state()`
- `tina-session`: `SessionLookup::list_all()` for worktree discovery, `Team`/`Task`/`Agent` types for file parsing, `SupervisorState`/`PhaseState` types (re-exported via tina-data)

## Risk Assessment

- **Convex Rust SDK maturity**: The `convex` crate is relatively new. Subscription reliability under network interruption needs monitoring. Mitigation: log errors, retry on failure, don't crash.
- **File watcher race conditions**: Rapid file changes could cause partial reads. Mitigation: debounce changes (100ms delay after last event before syncing), retry on parse failure.
- **Orchestration ID mapping**: The daemon needs to map local teams/tasks to Convex orchestration IDs. This requires either querying Convex or reading local supervisor-state.json. Use local files as source of truth since the daemon owns the outbound sync path.

## Verification

- `cargo build -p tina-daemon` succeeds
- `cargo test -p tina-daemon` passes
- All sync logic has unit tests with fixture data
- Config loading works with both file and environment variables
- File watcher correctly categorizes events from all three watch targets
