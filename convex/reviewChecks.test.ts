import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  createFeatureFixture,
  createReview,
  startReviewCheck,
} from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("reviewChecks", () => {
  describe("startCheck", () => {
    test("creates a running CLI check", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-start-1");
      const reviewId = await createReview(t, { orchestrationId });

      const checkId = await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "typecheck",
        kind: "cli",
        command: "mise typecheck",
      });

      expect(checkId).toBeDefined();

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks).toHaveLength(1);
      expect(checks[0].status).toBe("running");
      expect(checks[0].name).toBe("typecheck");
      expect(checks[0].kind).toBe("cli");
      expect(checks[0].command).toBe("mise typecheck");
      expect(checks[0].startedAt).toBeDefined();
    });

    test("creates a running project check (no command)", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-start-2");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "api-contracts",
        kind: "project",
      });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks[0].kind).toBe("project");
      expect(checks[0].command).toBeUndefined();
    });
  });

  describe("completeCheck", () => {
    test("completes a check as passed", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-complete-1");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "typecheck",
      });

      await t.mutation(api.reviewChecks.completeCheck, {
        reviewId: reviewId as any,
        name: "typecheck",
        status: "passed",
      });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks[0].status).toBe("passed");
      expect(checks[0].completedAt).toBeDefined();
      expect(checks[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    test("completes a check as failed with comment and output", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-complete-2");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "test",
      });

      await t.mutation(api.reviewChecks.completeCheck, {
        reviewId: reviewId as any,
        name: "test",
        status: "failed",
        comment: "3 tests failed",
        output: "FAIL src/foo.test.ts\n  × should work",
      });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks[0].status).toBe("failed");
      expect(checks[0].comment).toBe("3 tests failed");
      expect(checks[0].output).toContain("FAIL");
    });

    test("throws when check does not exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-complete-3");
      const reviewId = await createReview(t, { orchestrationId });

      await expect(
        t.mutation(api.reviewChecks.completeCheck, {
          reviewId: reviewId as any,
          name: "nonexistent",
          status: "passed",
        }),
      ).rejects.toThrow('Check "nonexistent" not found');
    });

    test("throws when completing an already-completed check", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-complete-4");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "typecheck",
      });

      await t.mutation(api.reviewChecks.completeCheck, {
        reviewId: reviewId as any,
        name: "typecheck",
        status: "passed",
      });

      await expect(
        t.mutation(api.reviewChecks.completeCheck, {
          reviewId: reviewId as any,
          name: "typecheck",
          status: "failed",
        }),
      ).rejects.toThrow("already completed");
    });
  });

  describe("listChecksByReview", () => {
    test("lists all checks for a review", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-list-1");
      const reviewId = await createReview(t, { orchestrationId });

      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "typecheck",
        kind: "cli",
      });
      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "test",
        kind: "cli",
      });
      await startReviewCheck(t, {
        reviewId,
        orchestrationId,
        name: "api-contracts",
        kind: "project",
      });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks).toHaveLength(3);
    });

    test("returns empty array when no checks exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "chk-list-2");
      const reviewId = await createReview(t, { orchestrationId });

      const checks = await t.query(api.reviewChecks.listChecksByReview, {
        reviewId: reviewId as any,
      });
      expect(checks).toHaveLength(0);
    });
  });
});
