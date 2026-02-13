# Feedback Fabric v1 — Phase 4: Hardening

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 89872bc8a52d9f249d5865631c21843b65fd6f2a

**Goal:** Harden the feedback fabric implementation: fix the blocking summary contract mismatch between Convex and Rust, add pagination limits to unbounded queries, verify index coverage, and add an end-to-end smoke test.

**Architecture:** Targeted fixes to existing implementations. No new tables, components, or architectural patterns. All changes are within existing files.

**Phase context:** Phase 1 added `feedbackEntries` table + Convex mutations/queries. Phase 2 added web UI components. Phase 3 added Rust `tina-data` wrappers and integration tests. Phase 4 addresses hardening items: index audit, pagination, contract alignment, and a smoke test.

**Key findings from codebase exploration:**

1. **Contract mismatch (blocking):** The Convex `getBlockingFeedbackSummary` returns `{ openAskForChangeCount, entries }`, which matches the web schema. But the Rust `BlockingFeedbackSummary` type expects `{ total_blocking, by_target_type: { task, commit } }` and the extraction helper reads `totalBlocking`/`byTargetType` — fields that don't exist in the response. Agents currently get `0` for all counts. This must be fixed.

2. **No pagination:** `listFeedbackEntriesByOrchestration` and `listFeedbackEntriesByTarget` use `.collect()` with no limit. With 100+ entries per orchestration, this could hit Convex per-function read limits. The codebase already uses `.take(limit)` pattern (see `tasks.ts:47`, `events.ts:40`, `telemetry.ts`).

3. **All 6 indexes are exercised.** No unused indexes to remove.

4. **Task validation cost is bounded.** `loadTaskEventsForOrchestration` already uses `.take(1000)`.

---

## Task 1: Fix `getBlockingFeedbackSummary` Convex response to include `byTargetType` breakdown

**Files:**
- `convex/feedbackEntries.ts`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Update `getBlockingFeedbackSummary` in `convex/feedbackEntries.ts` to return the richer response shape that includes a `byTargetType` breakdown. Keep `openAskForChangeCount` and `entries` for web backward compatibility.

Current return (lines 262-265):
```typescript
return {
  openAskForChangeCount: entries.length,
  entries,
};
```

Replace with:
```typescript
let taskCount = 0;
let commitCount = 0;
for (const entry of entries) {
  if (entry.targetType === "task") {
    taskCount++;
  } else {
    commitCount++;
  }
}

return {
  openAskForChangeCount: entries.length,
  totalBlocking: entries.length,
  byTargetType: { task: taskCount, commit: commitCount },
  entries,
};
```

2. Verify:

Run: `npm test -- --run convex/feedbackEntries.test.ts`
Expected: all existing tests pass (web-facing `openAskForChangeCount` unchanged).

---

## Task 2: Update web `BlockingFeedbackSummary` schema to accept new fields

**Files:**
- `tina-web/src/schemas/feedbackEntry.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** Task 1

### Steps

1. Update the `BlockingFeedbackSummary` Effect schema in `tina-web/src/schemas/feedbackEntry.ts` to accept the new optional fields without breaking existing consumers. Add `totalBlocking` and `byTargetType` as optional fields:

```typescript
export const BlockingFeedbackSummary = Schema.Struct({
  openAskForChangeCount: Schema.Number,
  totalBlocking: Schema.optional(Schema.Number),
  byTargetType: Schema.optional(Schema.Struct({
    task: Schema.Number,
    commit: Schema.Number,
  })),
  entries: Schema.Array(FeedbackEntry),
})
```

2. Verify web types still compile:

Run: `npx tsc --noEmit -p tina-web/tsconfig.json`
Expected: no type errors. Existing `FeedbackSummarySection` still reads `openAskForChangeCount` unchanged.

---

## Task 3: Fix Rust `BlockingFeedbackSummary` type and extraction helper

**Files:**
- `tina-data/src/types.rs`
- `tina-data/src/convex_client.rs`

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Update `BlockingFeedbackSummary` in `tina-data/src/types.rs` (lines 332-342) to match the actual Convex response:

Replace:
```rust
pub struct BlockingFeedbackSummary {
    pub total_blocking: u32,
    pub by_target_type: BlockingByTargetType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingByTargetType {
    pub task: u32,
    pub commit: u32,
}
```

With:
```rust
pub struct BlockingFeedbackSummary {
    pub open_ask_for_change_count: u32,
    pub total_blocking: u32,
    pub by_target_type: BlockingByTargetType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingByTargetType {
    pub task: u32,
    pub commit: u32,
}
```

2. Update `extract_blocking_feedback_summary` in `tina-data/src/convex_client.rs` (lines 1053-1075) to read the actual Convex fields:

Replace:
```rust
fn extract_blocking_feedback_summary(result: FunctionResult) -> Result<BlockingFeedbackSummary> {
    match result {
        FunctionResult::Value(Value::Object(obj)) => {
            let total = value_as_u32(&obj, "totalBlocking");
            let by_target = match obj.get("byTargetType") {
                Some(Value::Object(tt)) => BlockingByTargetType {
                    task: value_as_u32(tt, "task"),
                    commit: value_as_u32(tt, "commit"),
                },
                _ => BlockingByTargetType { task: 0, commit: 0 },
            };
            Ok(BlockingFeedbackSummary {
                total_blocking: total,
                by_target_type: by_target,
            })
        }
```

With:
```rust
fn extract_blocking_feedback_summary(result: FunctionResult) -> Result<BlockingFeedbackSummary> {
    match result {
        FunctionResult::Value(Value::Object(obj)) => {
            let open_count = value_as_u32(&obj, "openAskForChangeCount");
            let total = value_as_u32(&obj, "totalBlocking");
            let by_target = match obj.get("byTargetType") {
                Some(Value::Object(tt)) => BlockingByTargetType {
                    task: value_as_u32(tt, "task"),
                    commit: value_as_u32(tt, "commit"),
                },
                _ => BlockingByTargetType { task: 0, commit: 0 },
            };
            Ok(BlockingFeedbackSummary {
                open_ask_for_change_count: open_count,
                total_blocking: total,
                by_target_type: by_target,
            })
        }
```

3. Update the `blocking_feedback_summary_round_trip` test in `tina-data/src/types.rs` (around line 424) to include the new field:

```rust
#[test]
fn blocking_feedback_summary_round_trip() {
    let summary = BlockingFeedbackSummary {
        open_ask_for_change_count: 5,
        total_blocking: 5,
        by_target_type: BlockingByTargetType {
            task: 3,
            commit: 2,
        },
    };
    let json = serde_json::to_string(&summary).unwrap();
    let deserialized: BlockingFeedbackSummary = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.open_ask_for_change_count, 5);
    assert_eq!(deserialized.total_blocking, 5);
    assert_eq!(deserialized.by_target_type.task, 3);
    assert_eq!(deserialized.by_target_type.commit, 2);
}
```

4. Verify:

Run: `cargo test -p tina-data`
Expected: all tests pass including updated round-trip test.

---

## Task 4: Add pagination limits to `listFeedbackEntriesByOrchestration`

**Files:**
- `convex/feedbackEntries.ts`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add a `limit` argument with a default to `listFeedbackEntriesByOrchestration`. This follows the codebase pattern from `convex/events.ts` and `convex/telemetry.ts`.

In the `args` block (around line 153), add:
```typescript
limit: v.optional(v.number()),
```

2. Replace all three `.collect()` calls in the handler with `.take(limit)`:

At the top of the handler (after opening `async (ctx, args) => {`), add:
```typescript
const limit = args.limit ?? 200;
```

Then replace each `.collect()` (lines 177, 187, 195) with `.take(limit)`.

3. Do the same for `listFeedbackEntriesByTarget` — add `limit` arg and `.take(limit)` with default 200.

In the `args` block (around line 213), add:
```typescript
limit: v.optional(v.number()),
```

At the top of handler add:
```typescript
const limit = args.limit ?? 200;
```

Replace both `.collect()` calls (lines 226, 239) with `.take(limit)`.

4. Verify:

Run: `npm test -- --run convex/feedbackEntries.test.ts`
Expected: all existing tests still pass (they create < 200 entries).

---

## Task 5: Update Convex integration tests for blocking summary `byTargetType` breakdown

**Files:**
- `convex/feedbackEntries.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Update the existing `getBlockingFeedbackSummary` tests to also verify the new `totalBlocking` and `byTargetType` fields.

In the `"counts open ask_for_change entries"` test (around line 710-716), add assertions:
```typescript
expect(summary.totalBlocking).toBe(2);
expect(summary.byTargetType.task).toBe(1);
expect(summary.byTargetType.commit).toBe(1);
```

In the `"excludes resolved ask_for_change entries"` test (around line 744), add:
```typescript
expect(summary.totalBlocking).toBe(0);
expect(summary.byTargetType.task).toBe(0);
expect(summary.byTargetType.commit).toBe(0);
```

In the `"returns zero count when no entries exist"` test (around line 759), add:
```typescript
expect(summary.totalBlocking).toBe(0);
expect(summary.byTargetType.task).toBe(0);
expect(summary.byTargetType.commit).toBe(0);
```

2. Verify:

Run: `npm test -- --run convex/feedbackEntries.test.ts`
Expected: all tests pass.

---

## Task 6: Add end-to-end smoke test with mixed feedback lifecycle

**Files:**
- `convex/feedbackEntries.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 1, Task 4, Task 5

### Steps

1. Add a comprehensive smoke test at the end of the `feedbackEntries` describe block that exercises the full lifecycle in a single orchestration:

```typescript
describe("e2e smoke test", () => {
  test("full lifecycle: create mixed entries, filter, resolve, reopen, verify blocking", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "fb-e2e");

    // Seed targets
    await seedTaskEvent(t, orchestrationId, "1");
    await seedTaskEvent(t, orchestrationId, "2");
    await seedCommit(t, orchestrationId, "e2e_sha_001");
    await seedCommit(t, orchestrationId, "e2e_sha_002");

    // Create mixed entries
    const askTask1 = await createFeedbackEntry(t, {
      orchestrationId,
      targetType: "task",
      targetTaskId: "1",
      entryType: "ask_for_change",
      body: "Task 1 needs error handling",
      authorName: "reviewer",
    });

    await createFeedbackEntry(t, {
      orchestrationId,
      targetType: "task",
      targetTaskId: "2",
      entryType: "comment",
      body: "Task 2 looks good",
      authorName: "reviewer",
    });

    const askCommit = await createFeedbackEntry(t, {
      orchestrationId,
      targetType: "commit",
      targetCommitSha: "e2e_sha_001",
      entryType: "ask_for_change",
      body: "Commit needs test coverage",
      authorType: "agent",
      authorName: "test-agent",
    });

    await createFeedbackEntry(t, {
      orchestrationId,
      targetType: "commit",
      targetCommitSha: "e2e_sha_002",
      entryType: "suggestion",
      body: "Consider extracting a helper",
      authorName: "reviewer",
    });

    // Verify total count
    const allEntries = await t.query(
      api.feedbackEntries.listFeedbackEntriesByOrchestration,
      { orchestrationId: orchestrationId as any },
    );
    expect(allEntries).toHaveLength(4);

    // Verify blocking summary before resolution
    let summary = await t.query(
      api.feedbackEntries.getBlockingFeedbackSummary,
      { orchestrationId: orchestrationId as any },
    );
    expect(summary.openAskForChangeCount).toBe(2);
    expect(summary.totalBlocking).toBe(2);
    expect(summary.byTargetType.task).toBe(1);
    expect(summary.byTargetType.commit).toBe(1);

    // Resolve one blocking entry
    await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
      entryId: askTask1 as any,
      resolvedBy: "developer",
    });

    // Verify blocking count decremented
    summary = await t.query(
      api.feedbackEntries.getBlockingFeedbackSummary,
      { orchestrationId: orchestrationId as any },
    );
    expect(summary.openAskForChangeCount).toBe(1);
    expect(summary.totalBlocking).toBe(1);
    expect(summary.byTargetType.task).toBe(0);
    expect(summary.byTargetType.commit).toBe(1);

    // Reopen the resolved entry
    await t.mutation(api.feedbackEntries.reopenFeedbackEntry, {
      entryId: askTask1 as any,
    });

    // Verify blocking count restored
    summary = await t.query(
      api.feedbackEntries.getBlockingFeedbackSummary,
      { orchestrationId: orchestrationId as any },
    );
    expect(summary.openAskForChangeCount).toBe(2);
    expect(summary.totalBlocking).toBe(2);

    // Verify target-scoped queries
    const task1Entries = await t.query(
      api.feedbackEntries.listFeedbackEntriesByTarget,
      {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetRef: "1",
      },
    );
    expect(task1Entries).toHaveLength(1);

    const commitEntries = await t.query(
      api.feedbackEntries.listFeedbackEntriesByTarget,
      {
        orchestrationId: orchestrationId as any,
        targetType: "commit",
        targetRef: "e2e_sha_001",
      },
    );
    expect(commitEntries).toHaveLength(1);

    // Verify filter by entryType
    const askEntries = await t.query(
      api.feedbackEntries.listFeedbackEntriesByOrchestration,
      {
        orchestrationId: orchestrationId as any,
        entryType: "ask_for_change",
      },
    );
    expect(askEntries).toHaveLength(2);

    // Verify filter by authorType
    const agentEntries = await t.query(
      api.feedbackEntries.listFeedbackEntriesByOrchestration,
      {
        orchestrationId: orchestrationId as any,
        authorType: "agent",
      },
    );
    expect(agentEntries).toHaveLength(1);
    expect(agentEntries[0].authorName).toBe("test-agent");

    // Resolve all blocking, verify clean summary
    await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
      entryId: askTask1 as any,
      resolvedBy: "developer",
    });
    await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
      entryId: askCommit as any,
      resolvedBy: "developer",
    });

    summary = await t.query(
      api.feedbackEntries.getBlockingFeedbackSummary,
      { orchestrationId: orchestrationId as any },
    );
    expect(summary.openAskForChangeCount).toBe(0);
    expect(summary.totalBlocking).toBe(0);
    expect(summary.byTargetType.task).toBe(0);
    expect(summary.byTargetType.commit).toBe(0);
  });
});
```

2. Verify:

Run: `npm test -- --run convex/feedbackEntries.test.ts`
Expected: all tests pass including the new e2e smoke test.

---

## Task 7: Run full test suite to verify no regressions

**Files:**
- (none — verification only)

**Model:** haiku

**review:** spec-only

**Depends on:** Task 3, Task 4, Task 5, Task 6

### Steps

1. Run Rust tests for tina-data:

Run: `cargo test -p tina-data`
Expected: all tests pass including updated blocking summary round-trip test.

2. Run Convex tests:

Run: `npm test -- --run`
Expected: all tests pass including updated blocking summary assertions and new e2e smoke test.

3. Run cargo check across dependent crates:

Run: `cargo check -p tina-data -p tina-session -p tina-daemon`
Expected: all crates compile without errors.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 300 |

---

## Phase Estimates

| Task | Estimate |
|------|----------|
| Task 1: Fix Convex blocking summary response | 3 min |
| Task 2: Update web schema for new fields | 2 min |
| Task 3: Fix Rust types and extraction helper | 5 min |
| Task 4: Add pagination limits to queries | 4 min |
| Task 5: Update integration tests for byTargetType | 3 min |
| Task 6: E2E smoke test | 5 min |
| Task 7: Full test suite verification | 3 min |
| **Total** | **~25 min** |

---

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
