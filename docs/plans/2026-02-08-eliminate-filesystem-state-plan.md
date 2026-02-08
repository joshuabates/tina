# Eliminate Filesystem State — Implementation Plan

**Date:** 2026-02-08
**Goal:** Remove SessionLookup files and filesystem status polling. Convex becomes the sole source of truth for team→orchestration mapping and phase status.

## Design Decisions

- `tina-session init` outputs JSON with `orchestration_id` (breaking change)
- `tina-session register-team` writes team registry records to Convex
- `tina-session watch` uses Convex `ConvexClient::subscribe` for real-time push updates
- `teams` table in Convex: `registerTeam` enforces conditional upsert (same orchestrationId = update, different = error)
- No filesystem state for orchestration linking or phase status
- No name matching or heuristics in daemon sync

## Data Model (Convex)

### `teams` table (new)

| Field | Type | Description |
|-------|------|-------------|
| teamName | string | Team name (e.g., "feature-phase-1") |
| orchestrationId | Id<"orchestrations"> | Link to orchestration |
| leadSessionId | string | Claude session ID of team lead |
| phaseNumber | string \| null | null for orchestration team |
| createdAt | number | Epoch ms |

**Indexes:** `by_team_name` (unique semantic invariant), `by_orchestration`

### New Convex Functions

- `teams:registerTeam` — Conditional upsert: if teamName exists with same orchestrationId, patch; if different orchestrationId, error; else insert
- `teams:getByTeamName` — Query returning team record or null
- `orchestrations:getByFeature` — Query returning latest orchestration for a feature name
- `phases:getPhaseStatus` — Query returning phase record or null (used for watch subscription)

## Steps

### Step 1: Convex Schema + Functions
**Files:** `convex/schema.ts`, `convex/teams.ts` (new), `convex/orchestrations.ts`, `convex/phases.ts`

Add `teams` table to schema. Implement `registerTeam` mutation with conditional upsert logic. Add `getByTeamName` query. Add `getByFeature` query on orchestrations (returns latest by `startedAt`). Add `getPhaseStatus` query on phases.

### Step 2: tina-session convex.rs
**Files:** `tina-session/src/convex.rs`

Add client methods:
- `register_team(team_name, orchestration_id, lead_session_id, phase_number, created_at)` — calls `teams:registerTeam`
- `get_by_feature(feature_name)` — calls `orchestrations:getByFeature`, returns `{orchestration_id, worktree_path, branch, ...}`
- `get_phase_status(orchestration_id, phase_number)` — calls `phases:getPhaseStatus`
- `query_list_orchestrations()` — calls existing `listOrchestrations`
- Subscription support: method using `ConvexClient::subscribe` for `phases:getPhaseStatus`

### Step 3: tina-session init → JSON output
**Files:** `tina-session/src/commands/init.rs`, `tina-session/src/main.rs`

Change `init` to:
- Output JSON to stdout: `{orchestration_id, worktree_path, feature, branch, design_doc, total_phases}`
- Stop creating SessionLookup file
- Keep: worktree creation, statusline config, Convex orchestration record, supervisor state, daemon auto-start

### Step 4: tina-session register-team (new command)
**Files:** `tina-session/src/commands/register_team.rs` (new), `tina-session/src/commands/mod.rs`, `tina-session/src/main.rs`

New command:
```
tina-session register-team \
  --orchestration-id <id> \
  --team <team-name> \
  --lead-session-id <session-id> \
  --phase-number <N>  # optional, null for orchestration team
```

Calls `teams:registerTeam` via convex.rs.

### Step 5: tina-session watch (Convex subscription)
**Files:** `tina-session/src/commands/watch.rs` (rewrite), `tina-session/src/watch/status.rs` (rewrite)

Replace filesystem `notify` watcher with:
- `ConvexClient::subscribe("phases:getPhaseStatus", {orchestrationId, phaseNumber})` → `QuerySubscription` stream
- Stream updates to stdout as JSON
- Exit on terminal status (complete/blocked)
- `tokio::time::timeout` for timeout support
- Background task checking tmux session health → cancel subscription on session death

Exit codes: 0=complete, 1=blocked, 2=timeout, 3=session_died

Args change: `--feature` + `--phase` → `--orchestration-id` + `--phase` (since we no longer have SessionLookup to resolve feature→orchestration)

### Step 6: tina-session start/status/list/cleanup
**Files:** `tina-session/src/commands/start.rs`, `status.rs`, `list.rs`, `cleanup.rs`

- **start**: Use `get_by_feature()` to resolve worktree path instead of `SessionLookup::load()`
- **status**: Read from Convex `getPhaseStatus` + task progress instead of filesystem status.json
- **list**: Use `query_list_orchestrations()` instead of `SessionLookup::list_all()`
- **cleanup**: Remove SessionLookup deletion; optionally mark orchestration as cleaned up in Convex

### Step 7: tina-daemon sync.rs
**Files:** `tina-daemon/src/sync.rs`

- Replace `find_orchestration_id()` (name parsing + SessionLookup fallback) with Convex `teams:getByTeamName` query
- Remove `SessionLookup` import
- Remove `refresh_orchestration_ids()` cache based on `listOrchestrations` — the teams table provides direct lookup
- Simplify `SyncCache`: remove `orchestration_ids` HashMap (teams table replaces it)

### Step 8: tina-monitor
**Files:** `tina-monitor/src/data/local.rs`, `tina-monitor/src/types.rs`, `tina-monitor/src/data/mod.rs`

- `data/local.rs`: Replace `load_session_lookup()` / `sessions_dir()` based discovery with Convex queries. The existing `ConvexDataSource` already covers orchestration listing — migrate `DataSource` callers or add blocking Convex query helper.
- `types.rs`: Remove `SessionLookup` from re-exports, remove its serde test
- Remove `SessionLookup` from `tina-session/src/state/schema.rs`

### Step 9: Delete lookup.rs
**Files:** `tina-session/src/session/lookup.rs`, `tina-session/src/session/mod.rs`

Remove the file and its module declaration. All callers already migrated in steps 3-8.

### Step 10: Update Skills
**Files:** `skills/orchestrate/skill.md`, `skills/team-lead-init/skill.md`

- **orchestrate**: Parse JSON output from `tina-session init`. After spawning teams, call `tina-session register-team --orchestration-id ... --team ... --lead-session-id ... --phase-number ...`
- **team-lead-init**: Write phase status updates via `tina-session` Convex call instead of writing `status.json` to filesystem

### Step 11: Tests

- Convex function tests: `registerTeam` idempotent upsert, `registerTeam` error on mismatched orchestrationId, `getByTeamName`, `getByFeature`
- CLI tests: `init` JSON output shape, `register-team` happy path, `watch` exit codes
- tina-daemon tests: `sync_team_members` using Convex team lookup instead of name parsing
- tina-monitor tests: Remove SessionLookup serde tests, verify Convex-based discovery
- tina-harness: Update to parse init JSON, verify end-to-end with team registry

## Scope Boundaries

**Not changing:**
- SupervisorState (stays in Convex `supervisorStates` table — separate concern)
- `orchestrate next/advance` commands (already use SupervisorState from Convex)
- tina-web (already reads from Convex)

## Risks

- **Breaking change**: Init JSON output requires simultaneous updates to skills, tina-harness, and any external callers
- **leadSessionId**: Orchestrate skill reads from `~/.claude/teams/{team_name}/config.json` after team creation
- **Subscription stability**: Convex WebSocket reconnect behavior needs testing for long-running watches (10+ minutes)
- **tina-monitor local.rs**: May need a blocking Convex client wrapper if `DataSource` callers aren't async
