import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  createFeatureFixture,
  createReview,
  createReviewThread,
} from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("reviewThreads", () => {
  describe("createThread", () => {
    test("creates a thread on a review", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "rt-create-1",
      );
      const reviewId = await createReview(t, { orchestrationId });

      const threadId = await createReviewThread(t, {
        reviewId,
        orchestrationId,
        filePath: "src/main.ts",
        line: 10,
        commitSha: "abc1234",
        summary: "Missing null check",
        body: "Line 10 dereferences without checking for null.",
        severity: "p0",
        source: "agent",
        author: "spec-reviewer",
        gateImpact: "review",
      });

      expect(threadId).toBeDefined();

      const threads = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
      });
      expect(threads).toHaveLength(1);
      expect(threads[0].filePath).toBe("src/main.ts");
      expect(threads[0].line).toBe(10);
      expect(threads[0].status).toBe("unresolved");
      expect(threads[0].severity).toBe("p0");
      expect(threads[0].createdAt).toBeDefined();
    });

    test("creates a thread with default values from helper", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "rt-create-2",
      );
      const reviewId = await createReview(t, { orchestrationId });

      const threadId = await createReviewThread(t, {
        reviewId,
        orchestrationId,
      });

      expect(threadId).toBeDefined();

      const threads = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
      });
      expect(threads).toHaveLength(1);
      expect(threads[0].filePath).toBe("src/example.ts");
      expect(threads[0].line).toBe(42);
      expect(threads[0].severity).toBe("p1");
    });
  });

  describe("resolveThread", () => {
    test("resolves an unresolved thread", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "rt-resolve-1",
      );
      const reviewId = await createReview(t, { orchestrationId });
      const threadId = await createReviewThread(t, {
        reviewId,
        orchestrationId,
      });

      await t.mutation(api.reviewThreads.resolveThread, {
        threadId: threadId as any,
        resolvedBy: "developer",
      });

      const threads = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
      });
      expect(threads[0].status).toBe("resolved");
      expect(threads[0].resolvedBy).toBe("developer");
      expect(threads[0].resolvedAt).toBeDefined();
    });

    test("throws when resolving an already-resolved thread", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(
        t,
        "rt-resolve-2",
      );
      const reviewId = await createReview(t, { orchestrationId });
      const threadId = await createReviewThread(t, {
        reviewId,
        orchestrationId,
      });

      await t.mutation(api.reviewThreads.resolveThread, {
        threadId: threadId as any,
        resolvedBy: "developer",
      });

      await expect(
        t.mutation(api.reviewThreads.resolveThread, {
          threadId: threadId as any,
          resolvedBy: "developer",
        }),
      ).rejects.toThrow("already resolved");
    });
  });

  describe("listThreadsByReview", () => {
    test("lists all threads for a review", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rt-list-1");
      const reviewId = await createReview(t, { orchestrationId });

      await createReviewThread(t, {
        reviewId,
        orchestrationId,
        summary: "Finding 1",
      });
      await createReviewThread(t, {
        reviewId,
        orchestrationId,
        summary: "Finding 2",
      });

      const threads = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
      });
      expect(threads).toHaveLength(2);
    });

    test("filters by unresolved status", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rt-list-2");
      const reviewId = await createReview(t, { orchestrationId });

      const thread1 = await createReviewThread(t, {
        reviewId,
        orchestrationId,
        summary: "Will resolve",
      });
      await createReviewThread(t, {
        reviewId,
        orchestrationId,
        summary: "Stays open",
      });

      await t.mutation(api.reviewThreads.resolveThread, {
        threadId: thread1 as any,
        resolvedBy: "developer",
      });

      const unresolved = await t.query(
        api.reviewThreads.listThreadsByReview,
        { reviewId: reviewId as any, status: "unresolved" },
      );
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].summary).toBe("Stays open");
    });

    test("filters by resolved status", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rt-list-3");
      const reviewId = await createReview(t, { orchestrationId });

      const thread1 = await createReviewThread(t, {
        reviewId,
        orchestrationId,
        summary: "Resolved one",
      });
      await createReviewThread(t, {
        reviewId,
        orchestrationId,
        summary: "Open one",
      });

      await t.mutation(api.reviewThreads.resolveThread, {
        threadId: thread1 as any,
        resolvedBy: "developer",
      });

      const resolved = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
        status: "resolved",
      });
      expect(resolved).toHaveLength(1);
      expect(resolved[0].summary).toBe("Resolved one");
    });

    test("returns empty array when no threads exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rt-list-4");
      const reviewId = await createReview(t, { orchestrationId });

      const threads = await t.query(api.reviewThreads.listThreadsByReview, {
        reviewId: reviewId as any,
      });
      expect(threads).toHaveLength(0);
    });
  });

  describe("listThreadsByOrchestration", () => {
    test("lists threads across multiple reviews", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "rt-orch-1");
      const review1Id = await createReview(t, {
        orchestrationId,
        reviewerAgent: "reviewer-1",
      });
      const review2Id = await createReview(t, {
        orchestrationId,
        reviewerAgent: "reviewer-2",
      });

      await createReviewThread(t, {
        reviewId: review1Id,
        orchestrationId,
        summary: "From review 1",
      });
      await createReviewThread(t, {
        reviewId: review2Id,
        orchestrationId,
        summary: "From review 2",
      });

      const threads = await t.query(
        api.reviewThreads.listThreadsByOrchestration,
        { orchestrationId: orchestrationId as any },
      );
      expect(threads).toHaveLength(2);
    });

    test("does not leak threads across orchestrations", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId: orch1 } = await createFeatureFixture(
        t,
        "rt-orch-2a",
      );
      const { orchestrationId: orch2 } = await createFeatureFixture(
        t,
        "rt-orch-2b",
      );

      const review1 = await createReview(t, { orchestrationId: orch1 });
      const review2 = await createReview(t, { orchestrationId: orch2 });

      await createReviewThread(t, {
        reviewId: review1,
        orchestrationId: orch1,
        summary: "Orch 1 thread",
      });
      await createReviewThread(t, {
        reviewId: review2,
        orchestrationId: orch2,
        summary: "Orch 2 thread",
      });

      const orch1Threads = await t.query(
        api.reviewThreads.listThreadsByOrchestration,
        { orchestrationId: orch1 as any },
      );
      expect(orch1Threads).toHaveLength(1);
      expect(orch1Threads[0].summary).toBe("Orch 1 thread");
    });
  });
});
