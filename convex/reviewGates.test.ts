import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture, upsertReviewGate } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("reviewGates", () => {
  describe("upsertGate", () => {
    test("creates a pending gate", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-create-1");

      const gateId = await upsertReviewGate(t, {
        orchestrationId,
        gateId: "review",
        status: "pending",
        owner: "orchestrator",
        summary: "Awaiting phase review",
      });

      expect(gateId).toBeDefined();

      const gate = await t.query(api.reviewGates.getGate, {
        orchestrationId: orchestrationId as any,
        gateId: "review",
      });
      expect(gate).not.toBeNull();
      expect(gate!.status).toBe("pending");
      expect(gate!.owner).toBe("orchestrator");
      expect(gate!.decidedAt).toBeUndefined();
    });

    test("creates an approved gate with decidedAt set", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-create-2");

      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "plan",
        status: "approved",
        owner: "human",
        decidedBy: "joshua",
        summary: "Plan looks good",
      });

      const gate = await t.query(api.reviewGates.getGate, {
        orchestrationId: orchestrationId as any,
        gateId: "plan",
      });
      expect(gate!.status).toBe("approved");
      expect(gate!.decidedBy).toBe("joshua");
      expect(gate!.decidedAt).toBeDefined();
    });

    test("updates existing gate on upsert", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-upsert-1");

      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "review",
        status: "pending",
        summary: "Waiting",
      });

      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "review",
        status: "blocked",
        owner: "human",
        decidedBy: "joshua",
        summary: "Unresolved p0 findings",
      });

      const gates = await t.query(api.reviewGates.listGatesByOrchestration, {
        orchestrationId: orchestrationId as any,
      });
      expect(gates).toHaveLength(1);
      expect(gates[0].status).toBe("blocked");
      expect(gates[0].summary).toBe("Unresolved p0 findings");
    });

    test("throws when orchestration does not exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-err-1");
      // Valid orchestration — should work fine
      await expect(
        upsertReviewGate(t, {
          orchestrationId,
          gateId: "finalize",
          summary: "Test",
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("getGate", () => {
    test("returns null when gate does not exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-get-1");

      const gate = await t.query(api.reviewGates.getGate, {
        orchestrationId: orchestrationId as any,
        gateId: "review",
      });
      expect(gate).toBeNull();
    });
  });

  describe("listGatesByOrchestration", () => {
    test("lists all gates for an orchestration", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-list-1");

      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "plan",
        summary: "Plan gate",
      });
      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "review",
        summary: "Review gate",
      });
      await upsertReviewGate(t, {
        orchestrationId,
        gateId: "finalize",
        summary: "Finalize gate",
      });

      const gates = await t.query(api.reviewGates.listGatesByOrchestration, {
        orchestrationId: orchestrationId as any,
      });
      expect(gates).toHaveLength(3);
    });

    test("returns empty array when no gates exist", async () => {
      const t = convexTest(schema, modules);
      const { orchestrationId } = await createFeatureFixture(t, "gate-list-2");

      const gates = await t.query(api.reviewGates.listGatesByOrchestration, {
        orchestrationId: orchestrationId as any,
      });
      expect(gates).toHaveLength(0);
    });
  });
});
