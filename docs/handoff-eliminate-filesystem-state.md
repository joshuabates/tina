# Handoff: Eliminate Filesystem State

> Historical design note (not runtime protocol). This document may include proposal-only command names.

## Problem

Convex is supposed to be the single source of truth for orchestration state, but two filesystem-based state stores remain:

1. **SessionLookup** (`~/.claude/tina-sessions/{feature}.json`) - Maps feature name to worktree path, repo root, and created_at. Read by 6 commands, the daemon, and cleanup logic.

2. **Phase status.json** (`{worktree}/.claude/tina/phase-{N}/status.json`) - Written by team-lead-init skill inside tmux. Read by `tina-session wait` and `tina-session status` commands. The phase-executor depends on this to know when a phase completes.

Neither of these should exist. Both are already representable in Convex.

## What Uses What

### SessionLookup consumers

| File | Method | Purpose |
|------|--------|---------|
| `commands/init.rs:52-53` | `exists()`, `load()` | Check if already initialized |
| `commands/init.rs:78` | `new()` + `save()` | Create lookup on init |
| `commands/init.rs:324,363,400` | `delete()` | Cleanup on init failure |
| `commands/start.rs:43` | `load()` | Get worktree path to create tmux session |
| `commands/wait.rs:12` | `load()` | Get worktree path to find status.json |
| `commands/status.rs:5` | `load()` | Get worktree path to find status.json |
| `commands/cleanup.rs:4,9` | `exists()`, `delete()` | Remove on cleanup |
| `commands/list.rs:5` | `list_all()` | List all active sessions |
| `tina-daemon/src/sync.rs:374` | `list_all()` | Fallback: match team cwd to find orchestration |

Every consumer uses SessionLookup for one of two things:
- **Get worktree_path** (start, wait, status)
- **Check existence / list all** (init, cleanup, list, daemon)

### Phase status.json consumers

| File | Function | Purpose |
|------|----------|---------|
| `watch/status.rs:79-150` | `watch_status()` | Blocks until status.json says "complete" or "blocked" |
| `watch/status.rs:159-292` | `watch_status_streaming()` | Same, with periodic JSON updates to stdout |
| `watch/status.rs:295-305` | `get_current_status()` | One-shot read of current status |
| `commands/wait.rs:12-84` | `run()` | CLI entry point for `tina-session wait` |
| `commands/status.rs:1-67` | `run()` | CLI entry point for `tina-session status` |

The status.json file is written by the **team-lead-init skill** (a Claude agent running in tmux). The skill writes:
```json
{"status": "executing", "started_at": "..."}
```
And later:
```json
{"status": "complete", "started_at": "...", "completed_at": "...", "git_range": "abc..def"}
```
Or:
```json
{"status": "blocked", "started_at": "...", "blocked_at": "...", "reason": "..."}
```

## What Already Exists in Convex

### Orchestration record (replaces SessionLookup)
The `orchestrations` table already stores:
- `featureName` (= feature)
- `worktreePath` (= worktree_path, optional but populated by init)
- `branch`, `designDocPath`, `status`, `startedAt`, etc.

The `upsertOrchestration` mutation finds by `(featureName, nodeId)`.

### Phase record (replaces status.json)
The `phases` table already stores:
- `orchestrationId`, `phaseNumber`, `status`
- `planPath`, `gitRange`, `startedAt`, `completedAt`
- Timing breakdown

The `upsertPhase` mutation finds by `(orchestrationId, phaseNumber)`.

### SupervisorState (already migrated)
`SupervisorState::load()` and `save()` already read/write from Convex (`supervisorStates` table). No filesystem dependency remains.

## Refactoring Plan

### Phase 1: Replace SessionLookup with Convex queries

**New Convex query needed:** `orchestrations:getByFeature`
```typescript
export const getByFeature = query({
  args: { featureName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orchestrations")
      .withIndex("by_feature", q => q.eq("featureName", args.featureName))
      .order("desc")
      .first();
  },
});
```

**New tina-session method:** `ConvexWriter::get_orchestration_by_feature()`
```rust
pub async fn get_orchestration_by_feature(&mut self, feature: &str) -> Result<Option<OrchestrationRecord>> {
    // Query Convex for orchestration by feature name
}
```

**Changes to each consumer:**

1. **`commands/init.rs`**: Replace `SessionLookup::exists()` with `get_orchestration_by_feature()`. If orchestration exists in Convex, it's already initialized. Remove `SessionLookup::new()` and `save()`. The worktree_path is already written to the orchestration record.

2. **`commands/start.rs`**: Replace `SessionLookup::load()` with Convex query. Get `worktree_path` from the orchestration record.

3. **`commands/wait.rs`**: Replace `SessionLookup::load()` with Convex query. Get `worktree_path` from orchestration record.

4. **`commands/status.rs`**: Same as wait.

5. **`commands/cleanup.rs`**: Replace `SessionLookup::delete()` with... nothing. No filesystem state to clean up. Could optionally update orchestration status in Convex.

6. **`commands/list.rs`**: Replace `SessionLookup::list_all()` with `listOrchestrations` Convex query (already exists).

7. **`tina-daemon/src/sync.rs`**: Remove the cwd-based fallback (strategy 3 in `find_orchestration_id`). With idempotent registerNode and proper name matching (strategies 1 and 2), the SessionLookup fallback is unnecessary.

**Delete:** `tina-session/src/session/lookup.rs` entirely. Remove `SessionLookup` from `tina-session/src/state/schema.rs`.

### Phase 2: Replace status.json with Convex phase status

The phase status is already being synced to Convex by `tina-session orchestrate advance` -> `sync_to_convex()` -> `upsert_phase()`. The problem is the **wait command** currently watches a local file. It needs to subscribe to Convex instead.

**Option A: Convex subscription (preferred)**

The `tina-session wait` command subscribes to the Convex `phases` table for the given orchestration + phase number. When the phase status changes to "complete" or "blocked", the subscription fires and the wait completes.

The Convex Rust client supports subscriptions (`client.subscribe()`). The daemon already uses this pattern for `subscribe_pending_actions`.

**New Convex query:** `phases:getPhaseStatus`
```typescript
export const getPhaseStatus = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("phases")
      .withIndex("by_orchestration_phase", q =>
        q.eq("orchestrationId", args.orchestrationId)
         .eq("phaseNumber", args.phaseNumber))
      .first();
  },
});
```

**Changes to wait command:**

```rust
pub async fn run(feature: &str, phase: &str, ...) -> Result<u8> {
    // 1. Get orchestration ID from Convex by feature name
    let orch = writer.get_orchestration_by_feature(feature)?;
    let orch_id = orch.id;

    // 2. Subscribe to phase status
    let mut sub = client.subscribe("phases:getPhaseStatus", args).await?;

    // 3. Loop on subscription updates
    while let Some(result) = sub.next().await {
        let phase_record = parse_phase(result)?;
        match phase_record.status.as_str() {
            "complete" => return Ok(WaitResult { status: "complete", git_range: phase_record.git_range }),
            "blocked" => return Ok(WaitResult { status: "blocked", reason: phase_record.blocked_reason }),
            _ => { /* still executing, continue waiting */ }
        }
    }
}
```

**Who writes phase status to Convex?**

Currently, `tina-session orchestrate advance` writes phase status via `sync_to_convex()`. This already happens at every state transition. The team-lead-init skill would need to call `tina-session orchestrate advance` to report phase completion instead of writing a local status.json file.

BUT: The team-lead-init skill runs inside a Claude session (tmux). It doesn't currently call `tina-session orchestrate advance`. It writes status.json directly. The orchestrate skill (the supervisor) calls `tina-session orchestrate advance` when it receives messages from teammates.

So the flow would be:
1. Team-lead completes phase -> calls `tina-session orchestrate advance --feature X --phase N --event execute_complete`
2. This updates phases table in Convex
3. `tina-session wait` subscription fires, detects "complete"
4. Phase-executor receives the wait result and reports to orchestrator

**Alternative:** The team-lead could call a simpler command like `tina-session phase update --feature X --phase N --status complete --git-range abc..def` that just upserts the phase in Convex without going through the full state machine.

**Option B: Polling (simpler, less elegant)**

Replace the file watcher with a periodic Convex query. Poll `phases:getPhaseStatus` every 5-10 seconds. Less reactive but simpler to implement.

### Phase 3: Clean up team-lead-init skill

Update the team-lead-init skill to stop writing `.claude/tina/phase-N/status.json`. Instead:
- On start: Call `tina-session phase update --status executing`
- On complete: Call `tina-session phase update --status complete --git-range X..Y`
- On blocked: Call `tina-session phase update --status blocked --reason "..."`

This requires a new `tina-session phase update` command that upserts just the phase record in Convex.

### Phase 4: Delete filesystem state code

- Delete `tina-session/src/session/lookup.rs`
- Delete `SessionLookup` from `schema.rs`
- Delete `tina-session/src/watch/status.rs` (replace with Convex subscription)
- Remove `.claude/tina/` directory creation from init
- Remove `tina-sessions/` directory references from cleanup
- Update daemon to remove SessionLookup fallback

## Files That Change

| File | Change |
|------|--------|
| `convex/orchestrations.ts` | Add `getByFeature` query |
| `convex/phases.ts` | Add `getPhaseStatus` query |
| `tina-session/src/convex.rs` | Add `get_orchestration_by_feature()`, `subscribe_phase_status()` |
| `tina-session/src/commands/init.rs` | Replace SessionLookup with Convex check |
| `tina-session/src/commands/start.rs` | Replace SessionLookup::load with Convex query |
| `tina-session/src/commands/wait.rs` | Replace file watcher with Convex subscription |
| `tina-session/src/commands/status.rs` | Replace file read with Convex query |
| `tina-session/src/commands/cleanup.rs` | Remove SessionLookup delete |
| `tina-session/src/commands/list.rs` | Replace list_all with Convex query |
| `tina-session/src/session/lookup.rs` | **DELETE** |
| `tina-session/src/watch/status.rs` | **REWRITE** to use Convex subscription |
| `tina-daemon/src/sync.rs` | Remove SessionLookup fallback from find_orchestration_id |
| `team-lead-init skill` | Replace status.json writes with tina-session CLI calls |
| `phase-executor agent` | No change (already uses tina-session wait) |

## Risks

1. **Convex connectivity** - If Convex is unreachable, ALL tina-session commands will fail. Currently, SessionLookup works offline. Mitigation: cache Convex responses locally as a fallback, or accept the dependency.

2. **Latency** - Each command now makes a network round-trip to Convex instead of reading a local file. For `wait`, the subscription model is actually better than file polling. For `start`/`status`, it adds ~100-200ms.

3. **Skill changes** - The team-lead-init skill needs to be updated to call tina-session CLI instead of writing files. This is a skill file change, not a code change, but it affects running orchestrations.

4. **Backward compatibility** - Active orchestrations that have SessionLookup files but no Convex data will break. Mitigation: keep SessionLookup as a fallback that logs a deprecation warning, remove after one release cycle.

## Verification

After refactoring:
- `ls ~/.claude/tina-sessions/` should be empty (or not exist)
- `find .worktrees/ -name "status.json"` should find nothing
- `tina-session list` should show orchestrations from Convex
- `tina-session wait` should complete via Convex subscription
- `tina-harness --full --verify` should pass end-to-end
- Daemon should sync teams/tasks without SessionLookup fallback

## Dependencies

- registerNode must be idempotent (done - this session)
- Daemon team name matching must work without cwd fallback (done - this session)
- Phase status must be written to Convex on every transition (done - this session)
