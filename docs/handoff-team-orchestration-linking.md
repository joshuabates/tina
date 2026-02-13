# Handoff: Team-to-Orchestration Linking

> Historical design note (not runtime protocol). This document may mention exploratory commands that are not implemented in current `tina-session`.

## The Problem

The daemon watches `~/.claude/teams/` and `~/.claude/tasks/` on the filesystem. When it sees a team, it needs to figure out which Convex orchestration that team belongs to so it can write `teamMembers` and `taskEvents` records with the correct `orchestrationId`.

Currently this is done by **reverse-engineering the feature name from the team directory name**, then looking up the feature name in a cache of orchestration IDs fetched from Convex. This is fragile, indirect, and shouldn't be necessary.

## How It Works Today

### Two naming conventions

`tina-session/src/session/naming.rs` defines canonical team/session names:

| Entity | Format | Example |
|--------|--------|---------|
| Orchestration team | `{feature}-orchestration` | `auth-orchestration` |
| Phase execution team | `{feature}-phase-{N}` | `auth-phase-1` |
| Tmux session | `tina-{feature}-phase-{N}` | `tina-auth-phase-1` |

### Daemon's 3-strategy matching

`tina-daemon/src/sync.rs:346-384`, `find_orchestration_id()`:

1. Strip `-orchestration` suffix → look up feature in cache
2. Strip `-phase-{N}` suffix → look up feature in cache
3. Fallback: match first team member's `cwd` against `SessionLookup` files on disk

### The cache

`refresh_orchestration_ids()` queries `listOrchestrations` from Convex, builds a `HashMap<feature_name, orchestration_id>`. Refreshed:
- Every 60 seconds (periodic)
- Before every team/task sync (on file change events)

### What goes wrong

1. **Cache race**: Orchestration created moments before team → cache hasn't refreshed yet → team not linked. Mitigated by refreshing before each sync, but still a window.

2. **Name ambiguity**: If a feature name contains `-phase-` or `-orchestration`, the suffix stripping extracts the wrong feature name. Unlikely but possible.

3. **Duplicate features**: Multiple orchestrations with the same feature name (from repeated runs). The cache keeps the latest by `started_at`, but this is a heuristic.

4. **Indirection**: Team → parse name → feature → query Convex → orchestration ID. Every step can fail silently.

5. **cwd fallback reads filesystem**: Strategy 3 reads `~/.claude/tina-sessions/*.json` (SessionLookup files) which we want to eliminate entirely (see `handoff-eliminate-filesystem-state.md`).

## What the Daemon Actually Needs

For each team in `~/.claude/teams/{name}/config.json`, the daemon needs the Convex `orchestrationId` to call:
- `teamMembers:upsertTeamMember(orchestrationId, phaseNumber, agentName, ...)`
- `tasks:recordTaskEvent(orchestrationId, phaseNumber, taskId, ...)`

That's it. One ID.

## The Right Fix

### Option A: Store orchestrationId in team metadata (preferred)

The orchestrate skill creates teams via `TeamCreate`. It already knows the orchestration ID — it called `tina-session init` which wrote the orchestration to Convex. If the team config carried the orchestration ID, the daemon wouldn't need to guess.

**Problem**: We don't control the team config format. Claude CLI writes `~/.claude/teams/{name}/config.json` with a fixed schema:

```json
{
  "name": "auth-orchestration",
  "description": "Orchestrating auth from design doc",
  "createdAt": 1706644800000,
  "leadAgentId": "lead@auth-orchestration",
  "leadSessionId": "13c46daf-ec5d-4f53-b03a-a5e96d9efc42",
  "members": [...]
}
```

We could put the orchestration ID in the `description` field as a structured string (e.g., `"orchestrationId:k1234567890 | Orchestrating auth"`), but that's a hack.

**Better**: Write a sidecar file next to the team config. When `tina-session init` creates the orchestration in Convex, also write:

```
~/.claude/teams/{team-name}/tina-metadata.json
```

```json
{
  "orchestration_id": "k1d5h8j3m7n9p2r4t6v8",
  "feature_name": "auth",
  "phase_number": null
}
```

For phase execution teams (created by `tina-session start`), write:

```json
{
  "orchestration_id": "k1d5h8j3m7n9p2r4t6v8",
  "feature_name": "auth",
  "phase_number": "1"
}
```

The daemon reads this file directly — no name parsing, no cache lookup, no Convex round-trip.

**Changes needed:**
- `tina-session init`: After `upsert_orchestration()` returns the ID, write `tina-metadata.json` to `~/.claude/teams/{feature}-orchestration/`
- `tina-session start`: Write `tina-metadata.json` to `~/.claude/teams/{feature}-phase-{N}/`
- `tina-daemon/src/sync.rs`: Read `tina-metadata.json` first. Fall back to name matching only if it doesn't exist (backward compat).

**Timing issue**: `tina-session init` runs BEFORE the orchestrate skill creates the team. The team directory doesn't exist yet when init runs. Two solutions:
1. `init` creates the team directory early and writes the metadata file. The team config gets written later by Claude CLI.
2. `init` stores the orchestration ID somewhere (Convex supervisorState, which it already does), and a separate step writes the metadata file after team creation.

Option 2 is cleaner. The orchestrate skill already calls `tina-session init` first, then `TeamCreate`. After `TeamCreate`, it could call a new command:

```bash
tina-session link-team --feature auth --team auth-orchestration
```

This command reads the orchestration ID from Convex (via the feature name) and writes `tina-metadata.json` into the team directory.

### Option B: Convex-side team registry

Instead of filesystem sidecar files, register teams in Convex directly. Add a `teams` table:

```typescript
teams: defineTable({
  orchestrationId: v.id("orchestrations"),
  teamName: v.string(),
  phaseNumber: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_team_name", ["teamName"])
  .index("by_orchestration", ["orchestrationId"]),
```

When the orchestrate skill creates a team, also call:
```bash
tina-session register-team --feature auth --team auth-orchestration
```

Which calls a Convex mutation to insert a team record.

The daemon then queries `teams:getByTeamName` to get the orchestration ID. No filesystem parsing at all.

**Pros**: Clean, no filesystem state, queryable from tina-web
**Cons**: Another Convex round-trip per team lookup (cacheable), requires skill changes

### Option C: Use leadSessionId (from user suggestion)

The team config has `leadSessionId` (a UUID). If we stored a mapping from this session ID to the orchestration ID (in Convex or filesystem), the daemon could look it up.

**Problem**: `leadSessionId` is a Claude-internal session UUID, not something `tina-session` controls. We'd need to capture it after team creation and register it. The orchestrate skill could do this, but it adds complexity for the same result as Option A or B.

## Recommendation

**Option A (sidecar file)** for the immediate fix:
- Simplest to implement
- No new Convex tables
- Daemon reads locally (fast, no network)
- Graceful fallback to name matching

**Option B (Convex team registry)** as the eventual target:
- Aligns with the "Convex is the only data store" principle
- Makes teams visible in tina-web
- Enables querying "which teams belong to this orchestration?" from any client

Both options require the same skill-side change: after `TeamCreate`, call a command to register the team-to-orchestration link.

## Current State After This Session

The name-matching approach was improved (added `-phase-{N}` strategy), but the fundamental fragility remains. The cwd fallback still reads SessionLookup files from disk. When SessionLookup is eliminated (per `handoff-eliminate-filesystem-state.md`), strategy 3 breaks entirely and only name matching remains.

The `refresh_orchestration_ids` cache-before-sync pattern mitigates timing issues but doesn't eliminate them. A team created within milliseconds of the orchestration could still miss the cache window.

## Files Involved

| File | Current Role |
|------|-------------|
| `tina-daemon/src/sync.rs:346-384` | `find_orchestration_id()` - the 3-strategy matching |
| `tina-daemon/src/sync.rs:253-284` | `refresh_orchestration_ids()` - cache from Convex |
| `tina-session/src/session/naming.rs` | Canonical name formats |
| `tina-session/src/commands/init.rs` | Creates orchestration in Convex, could write sidecar |
| `tina-session/src/commands/start.rs` | Creates phase tmux session, could write sidecar |
| `convex/schema.ts` | Would need `teams` table for Option B |
| Orchestrate skill | Calls `TeamCreate`, would need to call `link-team` or `register-team` after |

## Dependencies

- `registerNode` idempotent (done)
- Daemon team name matching for `-phase-{N}` (done)
- Eliminate SessionLookup filesystem state (planned, see other handoff)
