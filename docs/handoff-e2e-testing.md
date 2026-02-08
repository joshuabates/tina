# E2E Testing Handoff

## What Was Done

Ran an end-to-end orchestration test via `tina-harness --full --verify` to verify the entire pipeline: orchestration → tina-daemon → Convex → tina-web.

## Bugs Found and Fixed

### 1. tina-daemon: node_id filter prevents orchestration linking (CRITICAL)
**File:** `tina-daemon/src/sync.rs` — `refresh_orchestration_ids()`

**Root cause:** `registerNode` in `convex/nodes.ts` always creates a NEW node (never reuses existing). The daemon and tina-session each register separate node IDs. The daemon's `refresh_orchestration_ids` filtered orchestrations by `node_id == daemon_node_id`, which excluded all orchestrations created by tina-session.

**Fix:** Removed the node_id filter. All orchestrations are now included in the cache. Added `debug!` log for cache refresh count.

**Proper long-term fix:** Make `registerNode` idempotent — return existing node for same hostname instead of always inserting.

### 2. tina-daemon: task directory path mismatch (CRITICAL)
**File:** `tina-daemon/src/sync.rs` — `sync_tasks()`

**Root cause:** Claude CLI stores tasks at `~/.claude/tasks/{team_name}/` but the daemon looked at `~/.claude/tasks/{lead_session_id}/` (a UUID). Tasks were never found.

**Fix:** Changed `tasks_dir.join(&team.lead_session_id)` to `tasks_dir.join(team_name)`.

### 3. tina-daemon: stale cache on file change events
**File:** `tina-daemon/src/main.rs` — event loop

**Root cause:** When team/task file changes fire, the daemon tries to resolve orchestration IDs from a cache that's only refreshed every 60 seconds. If orchestration is created moments before the team, the cache misses it and silently skips syncing.

**Fix:** Added `refresh_orchestration_ids()` call before each team/task sync in the event loop.

### 4. tina-daemon: duplicate orchestration feature names
**File:** `tina-daemon/src/sync.rs` — `refresh_orchestration_ids()`

**Root cause:** Repeated runs create multiple orchestrations with the same feature name. The cache used `HashMap::insert` which keeps the last one encountered (nondeterministic order from Convex).

**Fix:** When building the cache, keep the orchestration with the latest `started_at` timestamp.

### 5. tina-harness: `claudesp` binary detection broken
**File:** `tina-harness/src/commands/run.rs` — `detect_claude_binary()`

**Root cause:** Used `which claudesp` to detect availability, but `claudesp` exists on PATH with a broken module. Detection should verify the binary actually runs.

**Fix:** Changed to `claudesp --version` check instead of `which`.

### 6. tina-harness: send_keys not using literal mode
**File:** `tina-session/src/tmux/send.rs` — `send_keys_raw()`

**Root cause:** tmux `send-keys` without `-l` flag can interpret special characters. Also, 100ms delay between text and Enter was insufficient for Claude TUI.

**Fix:** Added `-l` flag for literal text, increased delay to 500ms, added 2s settle delay in harness before sending commands.

### 7. tina-harness: polling uses supervisor state (wrong node_id)
**File:** `tina-harness/src/commands/run.rs` — `load_orchestration_state_from_convex()`

**Root cause:** Used `ConvexWriter::get_supervisor_state()` which queries by node_id. The harness's ConvexWriter registers yet another node_id, different from both daemon and tina-session.

**Fix:** Replaced with direct `TinaConvexClient::list_orchestrations()` query, filtered by feature name, picking the most recent.

### 8. tina-harness: finds old orchestration on duplicate names
**File:** `tina-harness/src/verify.rs` — `find_orchestration_by_feature()`

**Root cause:** Used `.find()` which returns first match. With multiple orchestrations sharing the same feature name, it could return an old one.

**Fix:** Changed to `.filter().max_by(started_at)` to pick the most recent.

### 9. tina-harness: stale state not cleaned between runs
**File:** `tina-harness/src/commands/run.rs` — `cleanup_stale_state()`

**Root cause:** Previous runs leave behind session lookups (`~/.claude/tina-sessions/`), team dirs, and task dirs. `tina-session init` fails with "already initialized".

**Fix:** Added `cleanup_stale_state()` function that removes session lookup, team dir, task dir, and stale tmux sessions before each full run.

### 10. Config path mismatch (macOS)
**Files:** `tina-daemon/src/config.rs`, `tina-session/src/config.rs`

**Root cause:** Both use `dirs::config_dir()` which on macOS returns `~/Library/Application Support/`. Config file was manually placed at `~/.config/tina/config.toml`.

**Workaround:** Copied config to `~/Library/Application Support/tina/config.toml`. Not a code fix.

**Proper fix needed:** Either use `~/.config/tina/` explicitly, or document that macOS uses `~/Library/Application Support/tina/`.

## What's Working

After the fixes:
- **Daemon syncs team members to Convex** ✅ — verified with `tina-harness verify`
- **Daemon syncs tasks to Convex** ✅ — 5 tasks synced correctly
- **Orchestration record created in Convex** ✅ — via tina-session init
- **tina-harness verify works** ✅ — queries Convex and validates assertions
- **Harness launches Claude in tmux** ✅ — interactive mode with skill command
- **tina-session init from orchestrate skill** ✅ — when binary is on PATH

## What's NOT Working / Remaining Issues

### Phases not synced to Convex
Phases are created via `tina-session` commands (upsert_phase), not the daemon. The orchestrate skill needs to call `tina-session` to create phase records. Currently 0 phases appear in Convex even though the orchestration runs. The harness polling for orchestration `status == "complete"` works in theory but the status field may not be updated by the skill.

### Orchestration status not updated
The orchestration record's `status` field is set at init time and may not be updated as the orchestration progresses. The skill would need to call `ConvexWriter::upsert_orchestration()` to update status to "complete" when done.

### Executor stuck on tina-session start
The executor agent tries to run `tina-session start` but fails because `tina-session init` was already done by the orchestrator. The skill's phase execution flow has coordination issues between the team lead and executor regarding who manages worktree/session state.

## How to Run

```bash
# Start daemon (needs config at ~/Library/Application Support/tina/config.toml)
cd tina-daemon && RUST_LOG=info cargo run -- --config ~/.config/tina/config.toml &

# Ensure tina-session is on PATH
ln -sf $(pwd)/tina-session/target/debug/tina-session ~/.local/bin/tina-session

# Clean stale state
rm -rf ~/.claude/teams/* ~/.claude/tasks/* /tmp/tina-harness
rm -f ~/.claude/tina-sessions/verbose-flag.json

# Run e2e test
cd tina-harness && cargo run -- run 01-single-phase-feature \
  --full --verify --force-baseline \
  --scenarios-dir ./scenarios \
  --test-project-dir ./test-project

# Or just verify Convex state for an existing orchestration
cargo run -- verify verbose-flag --min-tasks 1 --min-team-members 1
```

## Files Changed

- `tina-daemon/src/sync.rs` — Fixed node_id filter, task path, duplicate handling
- `tina-daemon/src/main.rs` — Added cache refresh before sync in event loop
- `tina-harness/src/commands/run.rs` — Fixed binary detection, polling, cleanup, settle delay
- `tina-harness/src/verify.rs` — Fixed duplicate orchestration selection
- `tina-harness/src/commands/verify.rs` — New verify command (from earlier session)
- `tina-harness/src/scenario/types.rs` — Added ConvexAssertions type
- `tina-harness/Cargo.toml` — Added tina-data, tokio, dirs dependencies
- `tina-session/src/tmux/send.rs` — Added `-l` flag, increased delay
- Scenario expected.json files — Added convex assertion sections

## Dependencies Added
- `tina-data` (path dep) in tina-harness
- `tokio` in tina-harness
- `dirs = "5"` in tina-harness
