# Phase 1: Foundation (Schema + Convex)

Implements schema changes and Convex functions from `docs/plans/2026-02-10-tina-web-phase-2-design.md`.

## Summary

Add `commits` and `plans` tables to Convex schema, implement mutations and queries for recording commits and syncing plans, test `agent_shutdown` event type with existing infrastructure. This phase establishes the data layer foundation for all subsequent work.

## Tasks

### Task 1.1: Add Convex schema tables

**Model:** opus

**File:** `convex/schema.ts`

Add two new tables to the schema:

**commits table:**
```typescript
commits: defineTable({
  orchestrationId: v.id("orchestrations"),
  phaseNumber: v.string(),                    // "1", "2", etc.
  sha: v.string(),                            // full SHA
  shortSha: v.string(),                       // 7-char SHA
  subject: v.string(),                        // commit message first line
  author: v.string(),                         // "Jane Doe <jane@example.com>"
  timestamp: v.string(),                      // ISO 8601
  insertions: v.number(),                     // lines added
  deletions: v.number(),                      // lines removed
  recordedAt: v.string(),                     // when synced to Convex
})
  .index("by_orchestration", ["orchestrationId"])
  .index("by_phase", ["orchestrationId", "phaseNumber"])
  .index("by_sha", ["sha"]),                  // prevent duplicates
```

**plans table:**
```typescript
plans: defineTable({
  orchestrationId: v.id("orchestrations"),
  phaseNumber: v.string(),
  planPath: v.string(),                       // "docs/plans/2026-02-10-feature-phase-1.md"
  content: v.string(),                        // full markdown content
  lastSynced: v.string(),                     // ISO 8601 timestamp
})
  .index("by_orchestration", ["orchestrationId"])
  .index("by_phase", ["orchestrationId", "phaseNumber"])
  .index("by_path", ["planPath"]),            // lookup by path
```

After adding tables, run `npx convex dev` to apply schema changes.

**Validation:**
- Schema migration succeeds without errors
- Both tables appear in Convex dashboard
- All indexes are created

**Dependencies:** None

**Blocker for:** Tasks 1.2, 1.3

### Task 1.2: Implement commits.ts functions

**Model:** opus

**File:** `convex/commits.ts` (new file)

Create Convex functions for commit recording and querying. Follow patterns from `convex/events.ts` and `convex/teamMembers.ts`.

**Mutations:**

```typescript
export const recordCommit = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    sha: v.string(),
    shortSha: v.string(),
    subject: v.string(),
    author: v.string(),
    timestamp: v.string(),
    insertions: v.number(),
    deletions: v.number(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate by SHA
    const existing = await ctx.db
      .query("commits")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("commits", {
      ...args,
      recordedAt: new Date().toISOString(),
    });
  },
});
```

**Queries:**

```typescript
export const listCommits = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("commits")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      );

    const commits = await q.collect();

    return args.phaseNumber
      ? commits.filter(c => c.phaseNumber === args.phaseNumber)
      : commits;
  },
});

export const getCommit = query({
  args: {
    sha: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("commits")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();
  },
});
```

**Tests:**

**File:** `convex/commits.test.ts` (new file)

Follow pattern from `convex/teams.test.ts`. Use `convex-test` with schema and `test_helpers.ts` fixtures.

Test cases:
- `recordCommit` creates new commit record with all fields
- `recordCommit` returns existing ID when called with same SHA (deduplication)
- `listCommits` returns all commits for orchestration when no phase filter
- `listCommits` returns only phase-specific commits when phaseNumber provided
- `listCommits` returns empty array for orchestration with no commits
- `getCommit` returns commit by SHA
- `getCommit` returns null for non-existent SHA

**Validation:**
- All tests pass (`npm test -- commits.test.ts`)
- Deduplication prevents duplicate commits
- Phase filtering works correctly

**Dependencies:** Task 1.1

**Blocker for:** Task 2.2, Task 3.2 (from Phase 2 and Phase 3)

### Task 1.3: Implement plans.ts functions

**Model:** opus

**File:** `convex/plans.ts` (new file)

Create Convex functions for plan syncing and retrieval. Follow patterns from `convex/events.ts`.

**Mutations:**

```typescript
export const upsertPlan = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    planPath: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_phase", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
         .eq("phaseNumber", args.phaseNumber)
      )
      .first();

    const lastSynced = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        planPath: args.planPath,
        lastSynced,
      });
      return existing._id;
    }

    return await ctx.db.insert("plans", { ...args, lastSynced });
  },
});
```

**Queries:**

```typescript
export const getPlan = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_phase", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
         .eq("phaseNumber", args.phaseNumber)
      )
      .first();
  },
});

export const listPlans = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      )
      .collect();
  },
});
```

**Tests:**

**File:** `convex/plans.test.ts` (new file)

Test cases:
- `upsertPlan` creates new plan record when none exists
- `upsertPlan` updates existing plan content when called again for same orchestration+phase
- `upsertPlan` updates lastSynced timestamp on update
- `upsertPlan` updates planPath if it changes
- `getPlan` returns correct plan for orchestration+phase
- `getPlan` returns null when no plan exists
- `listPlans` returns all plans for orchestration
- `listPlans` returns empty array for orchestration with no plans

**Validation:**
- All tests pass (`npm test -- plans.test.ts`)
- Upsert logic correctly creates or updates
- Timestamps update on each sync

**Dependencies:** Task 1.1

**Blocker for:** Task 2.3, Task 3.3 (from Phase 2 and Phase 3)

### Task 1.4: Test shutdown events in events.ts

**Model:** opus

**File:** `convex/events.test.ts` (existing file, add tests)

Add test cases to verify existing `recordEvent` mutation handles `agent_shutdown` event type correctly. No code changes needed to `events.ts` - the mutation already supports arbitrary event types.

**Test cases to add:**
- `recordEvent` creates `agent_shutdown` event with correct structure
- `recordEvent` stores agent_name, agent_type in detail JSON
- `recordEvent` includes shutdown_detected_at timestamp in detail
- Query events by `eventType: "agent_shutdown"` returns only shutdown events
- Shutdown events appear in orchestration event timeline

**Example event structure:**
```json
{
  "eventType": "agent_shutdown",
  "summary": "executor-3 shutdown",
  "detail": "{\"agent_name\":\"executor-3\",\"agent_type\":\"tina:phase-executor\",\"shutdown_detected_at\":\"2026-02-10T20:30:00Z\"}"
}
```

**Validation:**
- All tests pass
- Shutdown events store and retrieve correctly
- Event detail JSON parses without errors

**Dependencies:** Task 1.1

**Blocker for:** Task 2.1 (from Phase 2)

## Integration

All tasks in this phase modify only Convex backend:
- Schema changes in `convex/schema.ts`
- New functions in `convex/commits.ts` and `convex/plans.ts`
- Test additions in `convex/commits.test.ts`, `convex/plans.test.ts`, `convex/events.test.ts`

No Rust code changes. No UI changes.

## Testing Strategy

**Unit tests:**
- Run `npm test` in `convex/` directory
- All new test files must pass
- Existing tests must continue to pass (no regressions)

**Manual verification:**
- Start Convex dev: `npx convex dev`
- Check Convex dashboard for new tables and indexes
- Manually insert test data via Convex dashboard
- Verify queries return expected results

**Exit criteria:**
- All Convex tests pass
- Schema changes applied successfully
- Functions deployable to Convex without errors
- Test coverage for all mutations and queries

## Estimated Time

- Task 1.1: 30 min (schema changes + verification)
- Task 1.2: 45 min (commits functions + tests)
- Task 1.3: 30 min (plans functions + tests)
- Task 1.4: 15 min (shutdown event tests)

**Total: ~2 hours**

## Success Criteria

1. Convex schema includes `commits` and `plans` tables with all indexes
2. `commits.ts` functions support recording and querying commits
3. `plans.ts` functions support upserting and retrieving plans
4. `agent_shutdown` events work with existing infrastructure
5. All tests pass (`npm test`)
6. No breaking changes to existing orchestrations
7. Functions deployable to Convex production

## Dependencies

This phase is a prerequisite for:
- **Phase 2:** tina-daemon watchers need these Convex functions
- **Phase 3:** UI components need these queries

No work can proceed in phases 2-4 until this phase completes.

## Rollback Plan

If issues arise:
1. Revert schema changes via Convex dashboard (remove tables)
2. Delete new files: `convex/commits.ts`, `convex/plans.ts`, test files
3. Revert test additions to `convex/events.test.ts`

Schema changes are non-breaking since existing code doesn't reference new tables.
