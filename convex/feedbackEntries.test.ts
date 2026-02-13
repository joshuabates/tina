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
