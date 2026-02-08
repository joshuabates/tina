# Orchestration Reliability v2

## Problem

The orchestration system has multiple interrelated reliability issues that prevent it from working end-to-end:

1. **Brittle string matching** links teams to orchestrations and finds orchestrations by feature-name prefix matching
2. **Phase executor tasks/teams are invisible** - only orchestrator-level tasks appear in Convex/tina-web
3. **No current task state** - only time-series `taskEvents` exist, no materialized current view
4. **Stale binaries** cause silent failures during testing
5. **Testing burns context** - running harness from main session wastes context on monitoring loops
6. **tina-web shows flat data** - no team hierarchy, no phase-grouped tasks

## Success Metrics

- Zero string/prefix matching in any linking or lookup path
- Phase executor teams and their tasks visible in both Convex queries and tina-web
- `getCurrentTasks` query returns correct current state for all tasks (orchestrator + phase executor)
- Harness auto-rebuilds binaries - no more stale binary failures
- Harness team pattern runs tests without burning main session context
- tina-web orchestration detail shows tasks grouped by phase and team

## Phase 1: Eliminate String Matching

### 1a. Remove PID suffix from feature names

`tina-session init` currently has no PID suffix (it was removed), but the harness still uses `derive_feature_name()` with hardcoded scenario-to-feature-name mappings and prefix matching to find orchestrations.

**Changes:**

- **`tina-harness/src/commands/run.rs`**: Remove `derive_feature_name()` entirely. Read `feature_name` from `scenario.json` instead.
- **`tina-harness/scenarios/*/scenario.json`**: Add `"feature_name"` field to each scenario config.
- **`tina-harness/src/scenario.rs`**: Add `feature_name: String` to `Scenario` struct.
- **`load_orchestration_state_from_convex()`**: Replace prefix matching with exact feature name match:
  ```rust
  // Before (brittle):
  let prefix = format!("{}-", feature_name);
  .filter(|o| o.record.feature_name == feature_name
      || o.record.feature_name.starts_with(&prefix))

  // After (exact):
  .filter(|o| o.record.feature_name == feature_name)
  ```

### 1b. Delete dead code

- **`tina-daemon/src/sync.rs`**: Delete `extract_phase_number()` and its tests. The `ActiveTeamRecord` from Convex already carries `phase_number` directly.

### 1c. Clean up harness state management

- **`cleanup_stale_state()`**: Use feature name from scenario config instead of deriving it.
- Remove the `derive_feature_name` match statement mapping scenario names to feature names.

## Phase 2: Verify and Harden Phase Team Linking

**NOTE:** The `register-team` CLI command already exists (`tina-session/src/main.rs:206-226`), and `tina-session start` already calls `register_phase_team()` internally (`start.rs:118`). The plumbing is there - the issue is ensuring the orchestrate skill uses it correctly.

### 2a. Verify the orchestrate skill passes `--parent-team-id` to `tina-session start`

The orchestrate skill calls `tina-session start --feature X --phase N --plan P`. It needs to also pass `--parent-team-id` (the orchestration team's Convex ID from `tina-session init` output).

**Audit:** Read `skills/orchestrate/SKILL.md` and verify the `tina-session start` invocation includes `--parent-team-id`. If missing, add it.

### 2b. Add a Convex admin query to verify team hierarchy

Add a diagnostic query that returns the full team tree for an orchestration - useful for debugging and for the convex-watcher agent:

```typescript
// convex/admin.ts
export const getTeamHierarchy = query({
  args: { orchestrationId: v.id("orchestrations") },
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      )
      .collect();
    return teams;
  },
});
```

This lets the watcher agent verify: "orchestration has 1 parent team + N phase teams, all linked correctly."

## Phase 3: Current Task State Query

**NOTE:** `getOrchestrationDetail` (`convex/orchestrations.ts:150-156`) already deduplicates task events into current state. But it's bundled inside the detail query. We need a standalone version for the watcher agent and for phase-grouped display.

### 3a. Add standalone `getCurrentTasks` Convex query

New query in `convex/tasks.ts` (file already exists with `listTaskEvents` and `recordTaskEvent`):

```typescript
export const getCurrentTasks = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("taskEvents")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      )
      .collect();

    // Group by taskId, keep latest event per task
    const latest = new Map<string, typeof events[0]>();
    for (const event of events) {
      const existing = latest.get(event.taskId);
      if (!existing || event.recordedAt > existing.recordedAt) {
        latest.set(event.taskId, event);
      }
    }

    return Array.from(latest.values());
  },
});
```

### 3b. Refactor `getOrchestrationDetail` to reuse the same dedup logic

Extract the dedup into a shared helper so `getOrchestrationDetail` and `getCurrentTasks` use identical logic. The detail query currently inlines it at `orchestrations.ts:150-156`.

### 3c. Return tasks grouped by phase in detail query

Update `getOrchestrationDetail` to return tasks grouped:
```typescript
{
  ...orchestration,
  orchestratorTasks: [...],  // phaseNumber is null
  phaseTasks: {              // keyed by phaseNumber
    "1": [...],
    "2": [...],
  },
  teamMembers,
}
```

This eliminates the need for a separate `getTasksByPhase` query - the detail query returns everything tina-web needs in one subscription.

## Phase 4: Harness Auto-Rebuild

### 4a. Add rebuild step to harness

Add a `rebuild_binaries()` function called once at harness startup (before any scenario runs):

```rust
fn rebuild_binaries(skip: bool) -> Result<()> {
    if skip {
        eprintln!("Skipping binary rebuild (--skip-build)");
        return Ok(());
    }

    eprintln!("Rebuilding tina binaries...");
    let output = Command::new("cargo")
        .args(["build", "-p", "tina-session", "-p", "tina-daemon"])
        .current_dir(project_root())
        .output()?;

    if !output.status.success() {
        bail!("Binary rebuild failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    // Restart daemon if running
    if tina_session::daemon::status().is_some() {
        eprintln!("Restarting daemon with new binary...");
        tina_session::daemon::stop()?;
        tina_session::daemon::start()?;
    }

    Ok(())
}
```

### 4b. Add `--skip-build` CLI flag

Add to harness CLI args. Default is to rebuild. Pass `--skip-build` when iterating quickly on test scenarios (not binary changes).

## Phase 5: Harness Team Pattern

### 5a. Team structure

When running `tina-harness run --full`, the test session spawns a team:

- **Team lead** (main session): creates tasks, assigns work, reports results
- **harness-runner**: executes `tina-harness run --full <scenario> --skip-build` (binaries already rebuilt by lead)
- **convex-watcher**: polls Convex every 10s during the run, reports anomalies

### 5b. Convex watcher behavior

The watcher agent:
1. Receives the expected feature name and phase count
2. Polls `getCurrentTasks` and `listActiveTeams` periodically
3. Reports milestones: "Orchestration appeared in Convex", "Phase 1 team registered", "3/5 tasks completed"
4. Reports anomalies: "5 minutes elapsed, no orchestration in Convex", "Phase team has no tasks after 2 minutes"
5. Stops when orchestration reaches terminal state (complete/blocked)

This gives real-time visibility into what's happening without the team lead burning context on polling loops.

### 5c. Implementation

This is a skill/workflow pattern, not new binary code. The harness team is orchestrated by a skill that:
1. Calls `rebuild_binaries()` first
2. Creates the team
3. Assigns harness-runner to run the scenario
4. Assigns convex-watcher to monitor
5. Collects results and reports pass/fail with details

## Phase 6: tina-web Hierarchy View

### 6a. Update orchestration detail page

The orchestration detail view should show:

```
Orchestration: verbose-flag (planning)
├── Phase 1
│   ├── Team: verbose-flag-phase-1-execution
│   │   ├── Members: team-lead, implementer, tester
│   │   └── Tasks:
│   │       ├── [completed] Implement --verbose flag
│   │       ├── [in_progress] Add tests for verbose output
│   │       └── [pending] Update README
│   └── Orchestrator Tasks:
│       ├── [completed] validate-design
│       ├── [completed] plan-phase-1
│       └── [in_progress] execute-phase-1
```

### 6b. New components/queries needed

- Use `listByParent` query to get child teams for each phase
- Use `getCurrentTasks` to get task state (replaces raw event display)
- Group tasks by `phaseNumber` field
- Show orchestrator tasks (phaseNumber null) separately from phase tasks

### 6c. Files to modify

- `tina-web/src/components/OrchestrationDetail.tsx`: Add phase-grouped task view
- `tina-web/src/components/TaskList.tsx`: Use `getCurrentTasks` instead of raw events
- `tina-web/src/components/TeamPanel.tsx`: Show parent/child hierarchy

## Deferred

- **Dev/prod Convex separation**: Use separate Convex deployments for testing vs real orchestrations. Not blocking current work.

## Dependencies

- Phases 1-4 are independent and can be done in parallel
- Phase 5 (harness team) depends on phase 4 (auto-rebuild)
- Phase 6 (tina-web) depends on phase 3 (grouped task query)

## Estimated Scope

- Phase 1: Small (delete code, add config field, change one filter)
- Phase 2: Small (audit skill, add one diagnostic query)
- Phase 3: Small-Medium (standalone query, refactor detail query, group tasks)
- Phase 4: Small (one function + CLI flag)
- Phase 5: Medium (new skill/workflow pattern)
- Phase 6: Medium (React component updates)

## Architectural Context

**Patterns to follow:**
- CLI subcommands: `tina-session/src/main.rs:24-240` (clap derive pattern with `Commands` enum)
- Convex queries: `convex/orchestrations.ts:125-175` (`getOrchestrationDetail` - joins across tables)
- Convex mutations: `convex/teams.ts:4-38` (`registerTeam` - upsert pattern with index lookup)
- Task dedup logic: `convex/orchestrations.ts:150-156` (Map keyed by taskId, keep latest by recordedAt)
- TeamPanel phase grouping: `tina-web/src/components/TeamPanel.tsx:16-22` (Map grouped by phaseNumber)
- Scenario config: `tina-harness/src/scenario/types.rs:9-21` (Scenario struct) + `tina-harness/src/scenario/loader.rs:12-48` (load from directory)

**Code to reuse:**
- `tina-session/src/commands/register_team.rs` - already handles team registration with all required fields
- `tina-session/src/commands/start.rs:135-154` - `register_phase_team()` already registers phase teams in Convex
- `convex/teams.ts:68-78` - `listByParent` query for team hierarchy traversal
- `tina-session::daemon::status/start/stop` - daemon lifecycle management for auto-restart after rebuild

**Anti-patterns:**
- Don't use feature-name prefix matching: `tina-harness/src/commands/run.rs:468-476`
- Don't hardcode scenario-to-feature mappings: `tina-harness/src/commands/run.rs:335-345`
- Don't parse phase numbers from team names: `tina-daemon/src/sync.rs:286-296`

**Integration:**
- Entry: Harness `run()` at `tina-harness/src/commands/run.rs:89`
- Scenario config: `tina-harness/src/scenario/types.rs` (add `feature_name` field)
- Convex queries: `convex/tasks.ts` (add `getCurrentTasks`)
- tina-web detail: `tina-web/src/components/OrchestrationDetail.tsx:130-137` (panels section)
- tina-web hook: `tina-web/src/hooks/useOrchestrationDetail.ts` (calls `getOrchestrationDetail`)
