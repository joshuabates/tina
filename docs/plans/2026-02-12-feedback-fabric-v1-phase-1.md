# Feedback Fabric v1 Phase 1: Schema + Convex APIs

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** cf65539e4bb32dd36bd75141e30f94ba6fcce695

**Goal:** Add the `feedbackEntries` table to Convex schema and implement the full API contract (create, resolve, reopen, list, filter, blocking summary) with comprehensive tests.

**Architecture:** New `feedbackEntries` table scoped by `orchestrationId` foreign key (like `commits`, `plans` — NOT added to `orchestrationCoreTableFields`). Target validation uses existing `loadTaskEventsForOrchestration` + `deduplicateTaskEvents` for task targets and `by_sha` index for commit targets with orchestrationId match check. Status transitions are guarded against invalid state and stale `updatedAt`. All six queries use the most specific index available and apply remaining filters in-memory.

**Key files:**
- `convex/schema.ts` — Add feedbackEntries table definition + indexes
- `convex/feedbackEntries.ts` — New file: mutations + queries
- `convex/feedbackEntries.test.ts` — New file: comprehensive test suite

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 600 |

---

## Tasks

### Task 1: Add feedbackEntries table to Convex schema

**Files:**
- `convex/schema.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Add the `feedbackEntries` table definition with all fields and indexes from the design document Data Model section.

**Steps:**

1. In `convex/schema.ts`, add the following table definition before the closing `});` at line 327 (after `featureFlags`):

```ts
  feedbackEntries: defineTable({
    orchestrationId: v.id("orchestrations"),
    targetType: v.union(v.literal("task"), v.literal("commit")),
    targetTaskId: v.optional(v.string()),
    targetCommitSha: v.optional(v.string()),
    entryType: v.union(
      v.literal("comment"),
      v.literal("suggestion"),
      v.literal("ask_for_change"),
    ),
    body: v.string(),
    authorType: v.union(v.literal("human"), v.literal("agent")),
    authorName: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    resolvedBy: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_orchestration_created", ["orchestrationId", "createdAt"])
    .index("by_orchestration_status_created", [
      "orchestrationId",
      "status",
      "createdAt",
    ])
    .index("by_orchestration_target_created", [
      "orchestrationId",
      "targetType",
      "createdAt",
    ])
    .index("by_orchestration_type_status", [
      "orchestrationId",
      "entryType",
      "status",
    ])
    .index("by_target_status_created", [
      "targetType",
      "targetTaskId",
      "status",
      "createdAt",
    ])
    .index("by_target_commit_status_created", [
      "targetType",
      "targetCommitSha",
      "status",
      "createdAt",
    ]),
```

2. Verify Convex codegen succeeds:

Run: `cd /Users/joshua/Projects/tina && npx convex dev --once 2>&1 | tail -10`

Expected: Codegen completes without errors, `feedbackEntries` table recognized.

---

### Task 2: Write feedbackEntries test suite (TDD - tests first)

**Files:**
- `convex/feedbackEntries.test.ts`

**Model:** opus

**review:** full

**Depends on:** 1

Write the complete test file covering all API behaviors. Tests will fail until implementation is added in subsequent tasks.

**Steps:**

1. Create `convex/feedbackEntries.test.ts` with the following content:

```ts
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

async function seedTaskEvent(
  t: ReturnType<typeof convexTest>,
  orchestrationId: string,
  taskId: string,
) {
  await t.mutation(api.tasks.recordTaskEvent, {
    orchestrationId: orchestrationId as any,
    taskId,
    subject: `Task ${taskId}`,
    status: "pending",
    recordedAt: new Date().toISOString(),
  });
}

async function seedCommit(
  t: ReturnType<typeof convexTest>,
  orchestrationId: string,
  sha: string,
) {
  await t.mutation(api.commits.recordCommit, {
    orchestrationId: orchestrationId as any,
    phaseNumber: "1",
    sha,
    shortSha: sha.slice(0, 7),
    subject: `Commit ${sha.slice(0, 7)}`,
    author: "test",
    timestamp: new Date().toISOString(),
    insertions: 10,
    deletions: 5,
  });
}

describe("feedbackEntries", () => {
  describe("createFeedbackEntry", () => {
    test("creates a comment on a task target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-create-1");
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "comment",
          body: "Looks good",
          authorType: "human",
          authorName: "alice",
        },
      );

      expect(entryId).toBeDefined();

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId: orchestrationId as any },
      );
      expect(entries).toHaveLength(1);
      expect(entries[0].targetType).toBe("task");
      expect(entries[0].targetTaskId).toBe("1");
      expect(entries[0].entryType).toBe("comment");
      expect(entries[0].status).toBe("open");
    });

    test("creates a suggestion on a commit target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-create-2");
      await seedCommit(t, orchestrationId, "abc1234567890");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "commit",
          targetCommitSha: "abc1234567890",
          entryType: "suggestion",
          body: "Consider refactoring this",
          authorType: "agent",
          authorName: "claude",
        },
      );

      expect(entryId).toBeDefined();
    });

    test("creates an ask_for_change entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-create-3");
      await seedTaskEvent(t, orchestrationId, "2");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "2",
          entryType: "ask_for_change",
          body: "Please fix the validation",
          authorType: "human",
          authorName: "bob",
        },
      );

      expect(entryId).toBeDefined();
    });

    test("throws when targetTaskId is missing for task target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-create-4");

      await expect(
        t.mutation(api.feedbackEntries.createFeedbackEntry, {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          entryType: "comment",
          body: "Missing task ID",
          authorType: "human",
          authorName: "alice",
        }),
      ).rejects.toThrow("targetTaskId is required");
    });

    test("throws when targetCommitSha is missing for commit target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-create-5");

      await expect(
        t.mutation(api.feedbackEntries.createFeedbackEntry, {
          orchestrationId: orchestrationId as any,
          targetType: "commit",
          entryType: "comment",
          body: "Missing SHA",
          authorType: "human",
          authorName: "alice",
        }),
      ).rejects.toThrow("targetCommitSha is required");
    });

    test("throws when task does not exist under orchestration", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-create-6");

      await expect(
        t.mutation(api.feedbackEntries.createFeedbackEntry, {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "999",
          entryType: "comment",
          body: "Ghost task",
          authorType: "human",
          authorName: "alice",
        }),
      ).rejects.toThrow("Task not found: 999");
    });

    test("throws when commit SHA does not exist", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-create-7");

      await expect(
        t.mutation(api.feedbackEntries.createFeedbackEntry, {
          orchestrationId: orchestrationId as any,
          targetType: "commit",
          targetCommitSha: "nonexistent",
          entryType: "comment",
          body: "Ghost commit",
          authorType: "human",
          authorName: "alice",
        }),
      ).rejects.toThrow("Commit not found: nonexistent");
    });

    test("throws when commit belongs to different orchestration", async () => {
      const t = convexTest(schema);
      const { orchestrationId: orch1 } = await createFeatureFixture(
        t,
        "fb-create-8a",
      );
      const { orchestrationId: orch2 } = await createFeatureFixture(
        t,
        "fb-create-8b",
      );
      await seedCommit(t, orch1, "sha_for_orch1");

      await expect(
        t.mutation(api.feedbackEntries.createFeedbackEntry, {
          orchestrationId: orch2 as any,
          targetType: "commit",
          targetCommitSha: "sha_for_orch1",
          entryType: "comment",
          body: "Wrong orchestration",
          authorType: "human",
          authorName: "alice",
        }),
      ).rejects.toThrow("Orchestration mismatch");
    });

    test("throws when targetCommitSha is set for task target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-create-9",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      await expect(
        t.mutation(api.feedbackEntries.createFeedbackEntry, {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          targetCommitSha: "should-not-be-here",
          entryType: "comment",
          body: "Extra field",
          authorType: "human",
          authorName: "alice",
        }),
      ).rejects.toThrow("targetCommitSha must not be set");
    });

    test("throws when targetTaskId is set for commit target", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-create-10",
      );
      await seedCommit(t, orchestrationId, "valid_sha_123");

      await expect(
        t.mutation(api.feedbackEntries.createFeedbackEntry, {
          orchestrationId: orchestrationId as any,
          targetType: "commit",
          targetCommitSha: "valid_sha_123",
          targetTaskId: "should-not-be-here",
          entryType: "comment",
          body: "Extra field",
          authorType: "human",
          authorName: "alice",
        }),
      ).rejects.toThrow("targetTaskId must not be set");
    });
  });

  describe("resolveFeedbackEntry", () => {
    test("resolves an open entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-resolve-1",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "ask_for_change",
          body: "Fix this",
          authorType: "human",
          authorName: "alice",
        },
      );

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "bob",
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId: orchestrationId as any },
      );
      expect(entries[0].status).toBe("resolved");
      expect(entries[0].resolvedBy).toBe("bob");
      expect(entries[0].resolvedAt).toBeDefined();
    });

    test("throws when resolving an already-resolved entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-resolve-2",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "comment",
          body: "Double resolve test",
          authorType: "human",
          authorName: "alice",
        },
      );

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "bob",
      });

      await expect(
        t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
          entryId: entryId as any,
          resolvedBy: "bob",
        }),
      ).rejects.toThrow("already resolved");
    });

    test("throws on stale updatedAt", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-resolve-3",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "comment",
          body: "Stale test",
          authorType: "human",
          authorName: "alice",
        },
      );

      await expect(
        t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
          entryId: entryId as any,
          resolvedBy: "bob",
          expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
        }),
      ).rejects.toThrow("Stale update");
    });
  });

  describe("reopenFeedbackEntry", () => {
    test("reopens a resolved entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-reopen-1",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "ask_for_change",
          body: "Reopen test",
          authorType: "human",
          authorName: "alice",
        },
      );

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "bob",
      });

      await t.mutation(api.feedbackEntries.reopenFeedbackEntry, {
        entryId: entryId as any,
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId: orchestrationId as any },
      );
      expect(entries[0].status).toBe("open");
      expect(entries[0].resolvedBy).toBeUndefined();
      expect(entries[0].resolvedAt).toBeUndefined();
    });

    test("throws when reopening an already-open entry", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-reopen-2",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "comment",
          body: "Double reopen test",
          authorType: "human",
          authorName: "alice",
        },
      );

      await expect(
        t.mutation(api.feedbackEntries.reopenFeedbackEntry, {
          entryId: entryId as any,
        }),
      ).rejects.toThrow("already open");
    });

    test("throws on stale updatedAt", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-reopen-3",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "comment",
          body: "Stale reopen test",
          authorType: "human",
          authorName: "alice",
        },
      );

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "bob",
      });

      await expect(
        t.mutation(api.feedbackEntries.reopenFeedbackEntry, {
          entryId: entryId as any,
          expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
        }),
      ).rejects.toThrow("Stale update");
    });
  });

  describe("listFeedbackEntriesByOrchestration", () => {
    test("lists all entries newest-first", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-list-1");
      await seedTaskEvent(t, orchestrationId, "1");
      await seedCommit(t, orchestrationId, "list_sha_1");

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "First",
        authorType: "human",
        authorName: "alice",
      });

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "commit",
        targetCommitSha: "list_sha_1",
        entryType: "suggestion",
        body: "Second",
        authorType: "agent",
        authorName: "claude",
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId: orchestrationId as any },
      );
      expect(entries).toHaveLength(2);
      expect(entries[0].body).toBe("Second");
      expect(entries[1].body).toBe("First");
    });

    test("filters by status", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-list-2");
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "comment",
          body: "Will resolve",
          authorType: "human",
          authorName: "alice",
        },
      );

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Stays open",
        authorType: "human",
        authorName: "bob",
      });

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "alice",
      });

      const openEntries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId: orchestrationId as any, status: "open" },
      );
      expect(openEntries).toHaveLength(1);
      expect(openEntries[0].body).toBe("Stays open");

      const resolvedEntries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId: orchestrationId as any, status: "resolved" },
      );
      expect(resolvedEntries).toHaveLength(1);
      expect(resolvedEntries[0].body).toBe("Will resolve");
    });

    test("filters by targetType", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-list-3");
      await seedTaskEvent(t, orchestrationId, "1");
      await seedCommit(t, orchestrationId, "filter_sha_1");

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Task entry",
        authorType: "human",
        authorName: "alice",
      });

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "commit",
        targetCommitSha: "filter_sha_1",
        entryType: "comment",
        body: "Commit entry",
        authorType: "human",
        authorName: "alice",
      });

      const taskEntries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId: orchestrationId as any, targetType: "task" },
      );
      expect(taskEntries).toHaveLength(1);
      expect(taskEntries[0].body).toBe("Task entry");
    });

    test("filters by entryType", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-list-4");
      await seedTaskEvent(t, orchestrationId, "1");

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "A comment",
        authorType: "human",
        authorName: "alice",
      });

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "ask_for_change",
        body: "A change request",
        authorType: "human",
        authorName: "alice",
      });

      const askEntries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        {
          orchestrationId: orchestrationId as any,
          entryType: "ask_for_change",
        },
      );
      expect(askEntries).toHaveLength(1);
      expect(askEntries[0].body).toBe("A change request");
    });

    test("filters by authorType", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(t, "fb-list-5");
      await seedTaskEvent(t, orchestrationId, "1");

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Human says",
        authorType: "human",
        authorName: "alice",
      });

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Agent says",
        authorType: "agent",
        authorName: "claude",
      });

      const agentEntries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByOrchestration,
        { orchestrationId: orchestrationId as any, authorType: "agent" },
      );
      expect(agentEntries).toHaveLength(1);
      expect(agentEntries[0].body).toBe("Agent says");
    });
  });

  describe("listFeedbackEntriesByTarget", () => {
    test("lists entries for a specific task", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-target-1",
      );
      await seedTaskEvent(t, orchestrationId, "1");
      await seedTaskEvent(t, orchestrationId, "2");

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "For task 1",
        authorType: "human",
        authorName: "alice",
      });

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "2",
        entryType: "comment",
        body: "For task 2",
        authorType: "human",
        authorName: "alice",
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByTarget,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetRef: "1",
        },
      );
      expect(entries).toHaveLength(1);
      expect(entries[0].body).toBe("For task 1");
    });

    test("lists entries for a specific commit", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-target-2",
      );
      await seedCommit(t, orchestrationId, "target_sha_a");
      await seedCommit(t, orchestrationId, "target_sha_b");

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "commit",
        targetCommitSha: "target_sha_a",
        entryType: "suggestion",
        body: "For commit a",
        authorType: "human",
        authorName: "alice",
      });

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "commit",
        targetCommitSha: "target_sha_b",
        entryType: "suggestion",
        body: "For commit b",
        authorType: "human",
        authorName: "alice",
      });

      const entries = await t.query(
        api.feedbackEntries.listFeedbackEntriesByTarget,
        {
          orchestrationId: orchestrationId as any,
          targetType: "commit",
          targetRef: "target_sha_a",
        },
      );
      expect(entries).toHaveLength(1);
      expect(entries[0].body).toBe("For commit a");
    });
  });

  describe("getBlockingFeedbackSummary", () => {
    test("counts open ask_for_change entries", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-blocking-1",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "ask_for_change",
        body: "Blocking 1",
        authorType: "human",
        authorName: "alice",
      });

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "ask_for_change",
        body: "Blocking 2",
        authorType: "human",
        authorName: "bob",
      });

      await t.mutation(api.feedbackEntries.createFeedbackEntry, {
        orchestrationId: orchestrationId as any,
        targetType: "task",
        targetTaskId: "1",
        entryType: "comment",
        body: "Not blocking",
        authorType: "human",
        authorName: "alice",
      });

      const summary = await t.query(
        api.feedbackEntries.getBlockingFeedbackSummary,
        { orchestrationId: orchestrationId as any },
      );
      expect(summary.openAskForChangeCount).toBe(2);
      expect(summary.entries).toHaveLength(2);
    });

    test("excludes resolved ask_for_change entries", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-blocking-2",
      );
      await seedTaskEvent(t, orchestrationId, "1");

      const entryId = await t.mutation(
        api.feedbackEntries.createFeedbackEntry,
        {
          orchestrationId: orchestrationId as any,
          targetType: "task",
          targetTaskId: "1",
          entryType: "ask_for_change",
          body: "Will resolve",
          authorType: "human",
          authorName: "alice",
        },
      );

      await t.mutation(api.feedbackEntries.resolveFeedbackEntry, {
        entryId: entryId as any,
        resolvedBy: "bob",
      });

      const summary = await t.query(
        api.feedbackEntries.getBlockingFeedbackSummary,
        { orchestrationId: orchestrationId as any },
      );
      expect(summary.openAskForChangeCount).toBe(0);
      expect(summary.entries).toHaveLength(0);
    });

    test("returns zero count when no entries exist", async () => {
      const t = convexTest(schema);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "fb-blocking-3",
      );

      const summary = await t.query(
        api.feedbackEntries.getBlockingFeedbackSummary,
        { orchestrationId: orchestrationId as any },
      );
      expect(summary.openAskForChangeCount).toBe(0);
      expect(summary.entries).toHaveLength(0);
    });
  });
});
```

2. Run tests to confirm they fail (module not found, since implementation doesn't exist yet):

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/feedbackEntries.test.ts 2>&1 | tail -10`

Expected: Tests fail because `api.feedbackEntries` does not exist yet.

---

### Task 3: Implement createFeedbackEntry mutation

**Files:**
- `convex/feedbackEntries.ts`

**Model:** opus

**review:** full

**Depends on:** 1, 2

Create `convex/feedbackEntries.ts` with the `createFeedbackEntry` mutation including strict target validation.

**Steps:**

1. Create `convex/feedbackEntries.ts` with the following content:

```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  loadTaskEventsForOrchestration,
  deduplicateTaskEvents,
} from "./tasks";

export const createFeedbackEntry = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    targetType: v.union(v.literal("task"), v.literal("commit")),
    targetTaskId: v.optional(v.string()),
    targetCommitSha: v.optional(v.string()),
    entryType: v.union(
      v.literal("comment"),
      v.literal("suggestion"),
      v.literal("ask_for_change"),
    ),
    body: v.string(),
    authorType: v.union(v.literal("human"), v.literal("agent")),
    authorName: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.targetType === "task") {
      if (!args.targetTaskId) {
        throw new Error(
          "targetTaskId is required when targetType is 'task'",
        );
      }
      if (args.targetCommitSha !== undefined) {
        throw new Error(
          "targetCommitSha must not be set when targetType is 'task'",
        );
      }
      const events = await loadTaskEventsForOrchestration(
        ctx,
        args.orchestrationId,
      );
      const tasks = deduplicateTaskEvents(events);
      const taskExists = tasks.some((t) => t.taskId === args.targetTaskId);
      if (!taskExists) {
        throw new Error(`Task not found: ${args.targetTaskId}`);
      }
    } else {
      if (!args.targetCommitSha) {
        throw new Error(
          "targetCommitSha is required when targetType is 'commit'",
        );
      }
      if (args.targetTaskId !== undefined) {
        throw new Error(
          "targetTaskId must not be set when targetType is 'commit'",
        );
      }
      const commit = await ctx.db
        .query("commits")
        .withIndex("by_sha", (q) => q.eq("sha", args.targetCommitSha!))
        .first();
      if (!commit) {
        throw new Error(`Commit not found: ${args.targetCommitSha}`);
      }
      if (commit.orchestrationId !== args.orchestrationId) {
        throw new Error(
          `Orchestration mismatch: commit belongs to ${commit.orchestrationId}, got ${args.orchestrationId}`,
        );
      }
    }

    const now = new Date().toISOString();
    return await ctx.db.insert("feedbackEntries", {
      orchestrationId: args.orchestrationId,
      targetType: args.targetType,
      targetTaskId: args.targetTaskId,
      targetCommitSha: args.targetCommitSha,
      entryType: args.entryType,
      body: args.body,
      authorType: args.authorType,
      authorName: args.authorName,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

Note: This file will be extended in subsequent tasks. Only `createFeedbackEntry` is added now to make the creation tests pass.

2. Add stub exports for the remaining functions so the test file can import them (tests for these will fail but won't crash on missing exports):

Append to the same file:

```ts
export const resolveFeedbackEntry = mutation({
  args: {
    entryId: v.id("feedbackEntries"),
    resolvedBy: v.string(),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error("Not implemented yet");
  },
});

export const reopenFeedbackEntry = mutation({
  args: {
    entryId: v.id("feedbackEntries"),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error("Not implemented yet");
  },
});

export const listFeedbackEntriesByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    targetType: v.optional(v.union(v.literal("task"), v.literal("commit"))),
    entryType: v.optional(
      v.union(
        v.literal("comment"),
        v.literal("suggestion"),
        v.literal("ask_for_change"),
      ),
    ),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
    authorType: v.optional(v.union(v.literal("human"), v.literal("agent"))),
  },
  handler: async () => {
    throw new Error("Not implemented yet");
  },
});

export const listFeedbackEntriesByTarget = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    targetType: v.union(v.literal("task"), v.literal("commit")),
    targetRef: v.string(),
  },
  handler: async () => {
    throw new Error("Not implemented yet");
  },
});

export const getBlockingFeedbackSummary = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async () => {
    throw new Error("Not implemented yet");
  },
});
```

3. Run the creation tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/feedbackEntries.test.ts -t "createFeedbackEntry" 2>&1 | tail -20`

Expected: The `createFeedbackEntry` tests that don't depend on list/resolve/reopen stubs should pass. Tests that call `listFeedbackEntriesByOrchestration` to verify results will fail (expected — those will pass after Task 5).

---

### Task 4: Implement resolveFeedbackEntry and reopenFeedbackEntry mutations

**Files:**
- `convex/feedbackEntries.ts`

**Model:** opus

**review:** full

**Depends on:** 3

Replace the stub implementations of `resolveFeedbackEntry` and `reopenFeedbackEntry` with full implementations.

**Steps:**

1. Replace the `resolveFeedbackEntry` stub with:

```ts
export const resolveFeedbackEntry = mutation({
  args: {
    entryId: v.id("feedbackEntries"),
    resolvedBy: v.string(),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      throw new Error(`Feedback entry not found: ${args.entryId}`);
    }
    if (entry.status === "resolved") {
      throw new Error("Feedback entry is already resolved");
    }
    if (
      args.expectedUpdatedAt !== undefined &&
      entry.updatedAt !== args.expectedUpdatedAt
    ) {
      throw new Error(
        `Stale update: expected updatedAt ${args.expectedUpdatedAt}, got ${entry.updatedAt}`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.entryId, {
      status: "resolved",
      resolvedBy: args.resolvedBy,
      resolvedAt: now,
      updatedAt: now,
    });
  },
});
```

2. Replace the `reopenFeedbackEntry` stub with:

```ts
export const reopenFeedbackEntry = mutation({
  args: {
    entryId: v.id("feedbackEntries"),
    expectedUpdatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      throw new Error(`Feedback entry not found: ${args.entryId}`);
    }
    if (entry.status === "open") {
      throw new Error("Feedback entry is already open");
    }
    if (
      args.expectedUpdatedAt !== undefined &&
      entry.updatedAt !== args.expectedUpdatedAt
    ) {
      throw new Error(
        `Stale update: expected updatedAt ${args.expectedUpdatedAt}, got ${entry.updatedAt}`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.entryId, {
      status: "open",
      resolvedBy: undefined,
      resolvedAt: undefined,
      updatedAt: now,
    });
  },
});
```

3. Run resolve/reopen tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/feedbackEntries.test.ts -t "resolveFeedbackEntry|reopenFeedbackEntry" 2>&1 | tail -20`

Expected: Resolve and reopen tests that don't depend on list queries will pass. Full passing comes after Task 5.

---

### Task 5: Implement query functions

**Files:**
- `convex/feedbackEntries.ts`

**Model:** opus

**review:** full

**Depends on:** 4

Replace stub implementations of all three query functions.

**Steps:**

1. Replace the `listFeedbackEntriesByOrchestration` stub with:

```ts
export const listFeedbackEntriesByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    targetType: v.optional(v.union(v.literal("task"), v.literal("commit"))),
    entryType: v.optional(
      v.union(
        v.literal("comment"),
        v.literal("suggestion"),
        v.literal("ask_for_change"),
      ),
    ),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved"))),
    authorType: v.optional(v.union(v.literal("human"), v.literal("agent"))),
  },
  handler: async (ctx, args) => {
    let entries;

    if (args.status !== undefined) {
      entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_orchestration_status_created", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("status", args.status!),
        )
        .order("desc")
        .collect();
    } else if (args.targetType !== undefined) {
      entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_orchestration_target_created", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("targetType", args.targetType!),
        )
        .order("desc")
        .collect();
    } else {
      entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_orchestration_created", (q) =>
          q.eq("orchestrationId", args.orchestrationId),
        )
        .order("desc")
        .collect();
    }

    if (args.targetType !== undefined && args.status !== undefined) {
      entries = entries.filter((e) => e.targetType === args.targetType);
    }
    if (args.entryType !== undefined) {
      entries = entries.filter((e) => e.entryType === args.entryType);
    }
    if (args.authorType !== undefined) {
      entries = entries.filter((e) => e.authorType === args.authorType);
    }

    return entries;
  },
});
```

2. Replace the `listFeedbackEntriesByTarget` stub with:

```ts
export const listFeedbackEntriesByTarget = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    targetType: v.union(v.literal("task"), v.literal("commit")),
    targetRef: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.targetType === "task") {
      const entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_target_status_created", (q) =>
          q.eq("targetType", "task").eq("targetTaskId", args.targetRef),
        )
        .order("desc")
        .collect();
      return entries.filter(
        (e) => e.orchestrationId === args.orchestrationId,
      );
    } else {
      const entries = await ctx.db
        .query("feedbackEntries")
        .withIndex("by_target_commit_status_created", (q) =>
          q
            .eq("targetType", "commit")
            .eq("targetCommitSha", args.targetRef),
        )
        .order("desc")
        .collect();
      return entries.filter(
        (e) => e.orchestrationId === args.orchestrationId,
      );
    }
  },
});
```

3. Replace the `getBlockingFeedbackSummary` stub with:

```ts
export const getBlockingFeedbackSummary = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("feedbackEntries")
      .withIndex("by_orchestration_type_status", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("entryType", "ask_for_change")
          .eq("status", "open"),
      )
      .collect();

    return {
      openAskForChangeCount: entries.length,
      entries,
    };
  },
});
```

4. Run all feedbackEntries tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run convex/feedbackEntries.test.ts 2>&1 | tail -30`

Expected: All tests pass.

---

### Task 6: Run full Convex test suite and fix regressions

**Files:**
- (any files needing fixes)

**Model:** opus

**review:** full

**Depends on:** 5

Run the full Convex test suite to ensure no regressions from the schema addition.

**Steps:**

1. Run all Convex tests:

Run: `cd /Users/joshua/Projects/tina && npm test 2>&1 | tail -30`

Expected: All tests pass, including all existing tests and the new `feedbackEntries.test.ts`.

2. Run TypeScript type check:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit 2>&1 | tail -20`

Expected: No type errors.

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Add feedbackEntries schema table | 2 min |
| 2 | Write full test suite (TDD) | 5 min |
| 3 | Implement createFeedbackEntry mutation | 5 min |
| 4 | Implement resolve/reopen mutations | 4 min |
| 5 | Implement query functions | 5 min |
| 6 | Run full test suite + fix regressions | 3 min |
| **Total** | | **~24 min** |

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
