# E2E Testing Handoff

## Current Status

**First successful end-to-end orchestration completed** on 2026-02-08 in ~12 minutes.
Full pipeline verified: tina-session init → orchestrate skill → tina-daemon → Convex.

### Convex Data After Successful Run (verbose-flag-56979)

| Data | Status |
|------|--------|
| Orchestration | `complete`, 12 min elapsed, timing captured |
| Phase 1 | `complete`, plan: 1 min, execute: 7 min, review: 2 min, git range captured |
| Orchestration tasks (5) | All status transitions tracked (validate, plan, execute, review, finalize) |
| Team | Registered with orchestration link |
| Phase execution tasks | **NOT synced** — see "Remaining Issues" |
| Phase team members | **NOT synced** — see "Remaining Issues" |

## Bugs Found and Fixed

### Session 1 (bugs 1-10)

#### 1. tina-daemon: node_id filter prevents orchestration linking (CRITICAL)
**File:** `tina-daemon/src/sync.rs` — `refresh_orchestration_ids()`

**Root cause:** `registerNode` in `convex/nodes.ts` always creates a NEW node (never reuses existing). The daemon and tina-session each register separate node IDs. The daemon's `refresh_orchestration_ids` filtered orchestrations by `node_id == daemon_node_id`, which excluded all orchestrations created by tina-session.

**Fix:** Removed the node_id filter. All orchestrations are now included in the cache. Added `debug!` log for cache refresh count.

**Proper long-term fix:** Make `registerNode` idempotent — return existing node for same hostname instead of always inserting.

#### 2. tina-daemon: task directory path mismatch (CRITICAL)
**File:** `tina-daemon/src/sync.rs` — `sync_tasks()`

**Root cause:** Claude CLI stores tasks at `~/.claude/tasks/{team_name}/` but the daemon looked at `~/.claude/tasks/{lead_session_id}/` (a UUID). Tasks were never found.

**Fix:** Changed `tasks_dir.join(&team.lead_session_id)` to `tasks_dir.join(team_name)`.

#### 3. tina-daemon: stale cache on file change events
**File:** `tina-daemon/src/main.rs` — event loop

**Root cause:** When team/task file changes fire, the daemon tries to resolve orchestration IDs from a cache that's only refreshed every 60 seconds. If orchestration is created moments before the team, the cache misses it and silently skips syncing.

**Fix:** Added `refresh_orchestration_ids()` call before each team/task sync in the event loop.

#### 4. tina-daemon: duplicate orchestration feature names
**File:** `tina-daemon/src/sync.rs` — `refresh_orchestration_ids()`

**Root cause:** Repeated runs create multiple orchestrations with the same feature name. The cache used `HashMap::insert` which keeps the last one encountered (nondeterministic order from Convex).

**Fix:** When building the cache, keep the orchestration with the latest `started_at` timestamp.

#### 5. tina-harness: Claude binary detection simplified
**File:** `tina-harness/src/commands/run.rs` — `detect_claude_binary()`

**Root cause:** Legacy support for a secondary Claude binary was no longer needed now that teams are in mainline Claude Code.

**Fix:** Removed alternate binary detection; only `claude --version` is used (with a fallback to `claude` for clear errors).

#### 6. tina-harness: send_keys not using literal mode
**File:** `tina-session/src/tmux/send.rs` — `send_keys_raw()`

**Root cause:** tmux `send-keys` without `-l` flag can interpret special characters. Also, 100ms delay between text and Enter was insufficient for Claude TUI.

**Fix:** Added `-l` flag for literal text, increased delay to 500ms, added 2s settle delay in harness before sending commands.

#### 7. tina-harness: polling uses supervisor state (wrong node_id)
**File:** `tina-harness/src/commands/run.rs` — `load_orchestration_state_from_convex()`

**Root cause:** Used `ConvexWriter::get_supervisor_state()` which queries by node_id. The harness's ConvexWriter registers yet another node_id, different from both daemon and tina-session.

**Fix:** Replaced with direct `TinaConvexClient::list_orchestrations()` query, filtered by feature name, picking the most recent.

#### 8. tina-harness: finds old orchestration on duplicate names
**File:** `tina-harness/src/verify.rs` — `find_orchestration_by_feature()`

**Root cause:** Used `.find()` which returns first match. With multiple orchestrations sharing the same feature name, it could return an old one.

**Fix:** Changed to `.filter().max_by(started_at)` to pick the most recent.

#### 9. tina-harness: stale state not cleaned between runs
**File:** `tina-harness/src/commands/run.rs` — `cleanup_stale_state()`

**Root cause:** Previous runs leave behind session lookups (`~/.claude/tina-sessions/`), team dirs, and task dirs. `tina-session init` fails with "already initialized".

**Fix:** Added `cleanup_stale_state()` function that removes session lookup, team dir, task dir, and stale tmux sessions before each full run.

#### 10. Config path mismatch (macOS)
**Files:** `tina-daemon/src/config.rs`, `tina-session/src/config.rs`

**Root cause:** Both use `dirs::config_dir()` which on macOS returns `~/Library/Application Support/`. Config file was manually placed at `~/.config/tina/config.toml`.

**Workaround:** Copied config to `~/Library/Application Support/tina/config.toml`. Not a code fix.

### Session 2 (bugs 11-13)

#### 11. tina-session: teams not registered in Convex (CRITICAL)
**Files:** `tina-session/src/commands/init.rs`, `tina-session/src/commands/start.rs`

**Root cause:** The daemon's `sync_team_members()` calls `lookup_orchestration_id(team_name)` which queries the `teams` table in Convex. But nobody ever called `tina-session register-team` to create the team-to-orchestration link. The daemon silently skipped all syncing because it couldn't resolve the orchestration ID.

**Fix:** `tina-session init` now pre-registers the orchestration team (`{feature}-orchestration`) in Convex. `tina-session start` now registers the phase execution team (`{feature}-phase-{N}`). Both use `leadSessionId: "pending"` as a placeholder until the real team lead starts.

#### 12. claudesp binary broken on PATH
**Root cause:** A stale `claudesp` binary at `~/.local/bin/claudesp` was being found on PATH. It pointed to a deleted sneakpeek install (`~/.claude-sneakpeek/`), causing `MODULE_NOT_FOUND` errors. This caused 3 consecutive orchestration failures at the execution step.

**Fix:** Renamed `~/.local/bin/claudesp` to `claudesp.broken`. The `detect_claude_binary()` in `tina-session start.rs` now only checks for `claude`.

#### 13. tina-harness: feature name prefix matching
**Files:** `tina-harness/src/commands/run.rs`, `tina-harness/src/verify.rs`

**Root cause:** `tina-session init` appends a PID suffix to feature names (e.g. `verbose-flag-56979`). The harness used exact match (`==`), so it found stale orchestrations with the base name instead of the current suffixed one.

**Fix:** Changed to prefix match with trailing dash: `starts_with("{feature_name}-")`.

## What's Working

- **Full orchestration lifecycle** ✅ — validate → plan → execute → review → complete
- **Orchestration record in Convex** ✅ — status transitions tracked, timing captured
- **Phase records in Convex** ✅ — plan/execute/review timing, git range, plan path
- **Orchestration-level tasks synced** ✅ — 5 tasks with status transitions
- **Orchestration team registered** ✅ — via tina-session init
- **Phase team registered** ✅ — via tina-session start
- **Daemon syncs team members** ✅ — for registered teams
- **Complexity gate works** ✅ — caught 55-line main(), team self-corrected
- **Harness launches Claude in tmux** ✅ — interactive mode, skill commands work
- **Harness polling detects completion** ✅ — prefix-matches feature names

## Remaining Issues

### Phase execution tasks not synced to Convex
The actual implementation tasks (e.g. "Add verbose flag to Cli struct", "Add unit tests") live in the phase execution team's task directory (`~/.claude/tasks/{feature}-phase-{N}/`). The phase team is now registered in Convex (bug #11 fix), so the daemon CAN link them. However, the phase team's task directory may be cleaned up before the daemon syncs all events. Need to verify this works on next run.

### Dead orchestrations in Convex
Failed runs leave stale orchestration records stuck at "planning" or "executing" forever. No cleanup mechanism exists. Need either: garbage collection for orphaned orchestrations, or a `tina-session cleanup --convex` command.

### Retry executor doesn't inherit metadata
When the orchestrator retries execution (e.g. after complexity gate failure), the retry executor agent doesn't get the correct feature name from task metadata. It derived `verbose-flag` instead of `verbose-flag-56979`. The orchestrate skill should propagate all required metadata before spawning retry agents.

### Executor agent spends time searching for context
The phase executor agent searches team config, task lists, etc. to find feature name, plan path, and worktree path. These should all be in the execute task metadata, set by the orchestrator before spawning.

### Finalize task status not captured
The finalize task shows as `pending` in Convex despite the orchestration completing. The team/task dirs are likely cleaned up before the daemon can sync the final status update.

## How to Run

```bash
# Ensure tina-session is on PATH
ln -sf $(pwd)/tina-session/target/debug/tina-session ~/.local/bin/tina-session

# Ensure tina-daemon is running
tina-session daemon start

# Clean stale state
rm -rf ~/.claude/teams/verbose-flag* ~/.claude/tasks/verbose-flag* /tmp/tina-harness

# Run e2e test
cd tina-harness && cargo run --release -- run 01-single-phase-feature \
  --full --verify --force-baseline \
  --scenarios-dir ./scenarios \
  --test-project-dir ./test-project \
  --work-dir /tmp/tina-harness

# Or just verify Convex state for an existing orchestration
cargo run --release -- verify verbose-flag --min-tasks 1 --min-team-members 1
```

## Files Changed

### Session 1
- `tina-daemon/src/sync.rs` — Fixed node_id filter, task path, duplicate handling
- `tina-daemon/src/main.rs` — Added cache refresh before sync in event loop
- `tina-harness/src/commands/run.rs` — Fixed binary detection, polling, cleanup, settle delay
- `tina-harness/src/verify.rs` — Fixed duplicate orchestration selection
- `tina-harness/src/commands/verify.rs` — New verify command
- `tina-harness/src/scenario/types.rs` — Added ConvexAssertions type
- `tina-harness/Cargo.toml` — Added tina-data, tokio, dirs dependencies
- `tina-session/src/tmux/send.rs` — Added `-l` flag, increased delay

### Session 2
- `tina-session/src/commands/init.rs` — Register orchestration team in Convex
- `tina-session/src/commands/start.rs` — Register phase execution team in Convex
- `tina-harness/src/commands/run.rs` — Prefix match for feature names
- `tina-harness/src/verify.rs` — Prefix match for feature names
