import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

// Helper: insert a controlPlaneAction directly via db
async function insertAction(
  t: ReturnType<typeof convexTest>,
  fields: {
    orchestrationId: string;
    actionType: string;
    status: string;
    createdAt: number;
    completedAt?: number;
    result?: string;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("controlPlaneActions", {
      orchestrationId: fields.orchestrationId as any,
      actionType: fields.actionType,
      payload: "{}",
      requestedBy: "test",
      idempotencyKey: `key-${fields.actionType}-${fields.createdAt}`,
      status: fields.status,
      createdAt: fields.createdAt,
      ...(fields.completedAt !== undefined
        ? { completedAt: fields.completedAt }
        : {}),
      ...(fields.result !== undefined ? { result: fields.result } : {}),
    });
  });
}

describe("controlPlaneDashboard:launchSuccessRate", () => {
  test("returns zeroes when no actions exist", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.controlPlaneDashboard.launchSuccessRate, {});
    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, rate: null });
  });

  test("counts completed vs failed start_orchestration actions", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "dash-test");

    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 1000,
      completedAt: 2000,
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 2000,
      completedAt: 3000,
      result: JSON.stringify({ error_code: "node_offline" }),
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 3000,
      completedAt: 4000,
    });
    // Non-launch action should be ignored
    await insertAction(t, {
      orchestrationId,
      actionType: "pause",
      status: "completed",
      createdAt: 4000,
      completedAt: 5000,
    });

    const result = await t.query(api.controlPlaneDashboard.launchSuccessRate, {});
    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.rate).toBeCloseTo(2 / 3);
  });

  test("respects since filter", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "dash-since");

    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 1000,
      completedAt: 2000,
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 5000,
      completedAt: 6000,
    });

    const result = await t.query(api.controlPlaneDashboard.launchSuccessRate, {
      since: 3000,
    });
    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.rate).toBe(0);
  });
});

describe("controlPlaneDashboard:actionLatency", () => {
  test("returns empty object when no completed actions", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.controlPlaneDashboard.actionLatency, {});
    expect(result).toEqual({});
  });

  test("calculates median and p95 latency grouped by action type", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "latency-test");

    // 3 start_orchestration actions with latencies: 100, 200, 300
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 1000,
      completedAt: 1100, // 100ms
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 2000,
      completedAt: 2200, // 200ms
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 3000,
      completedAt: 3300, // 300ms
    });
    // 1 pause action with latency 500
    await insertAction(t, {
      orchestrationId,
      actionType: "pause",
      status: "completed",
      createdAt: 4000,
      completedAt: 4500, // 500ms
    });
    // pending action should be excluded (no completedAt)
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "pending",
      createdAt: 5000,
    });

    const result = await t.query(api.controlPlaneDashboard.actionLatency, {});

    expect(result.start_orchestration).toBeDefined();
    expect(result.start_orchestration.count).toBe(3);
    expect(result.start_orchestration.medianMs).toBe(200); // median of [100, 200, 300]
    expect(result.start_orchestration.p95Ms).toBe(300); // p95 of 3 items = last

    expect(result.pause).toBeDefined();
    expect(result.pause.count).toBe(1);
    expect(result.pause.medianMs).toBe(500);
    expect(result.pause.p95Ms).toBe(500);
  });

  test("respects since filter", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "latency-since");

    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 1000,
      completedAt: 1100,
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 5000,
      completedAt: 5400, // 400ms
    });

    const result = await t.query(api.controlPlaneDashboard.actionLatency, {
      since: 3000,
    });

    expect(result.start_orchestration).toBeDefined();
    expect(result.start_orchestration.count).toBe(1);
    expect(result.start_orchestration.medianMs).toBe(400);
  });
});

describe("controlPlaneDashboard:failureDistribution", () => {
  test("returns zero totals when no failed actions", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(
      api.controlPlaneDashboard.failureDistribution,
      {},
    );
    expect(result).toEqual({ totalFailed: 0, byActionType: {} });
  });

  test("groups failures by action type and reason code", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "fail-dist");

    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 1000,
      completedAt: 2000,
      result: JSON.stringify({ error_code: "node_offline" }),
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 2000,
      completedAt: 3000,
      result: JSON.stringify({ error_code: "node_offline" }),
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 3000,
      completedAt: 4000,
      result: JSON.stringify({ error_code: "invalid_payload" }),
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "pause",
      status: "failed",
      createdAt: 4000,
      completedAt: 5000,
      result: JSON.stringify({ error_code: "phase_not_found" }),
    });
    // Completed action should be excluded
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "completed",
      createdAt: 5000,
      completedAt: 6000,
    });

    const result = await t.query(
      api.controlPlaneDashboard.failureDistribution,
      {},
    );

    expect(result.totalFailed).toBe(4);
    expect(result.byActionType.start_orchestration).toEqual({
      node_offline: 2,
      invalid_payload: 1,
    });
    expect(result.byActionType.pause).toEqual({
      phase_not_found: 1,
    });
  });

  test("handles missing or unparseable result gracefully", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "fail-edge");

    // No result field
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 1000,
      completedAt: 2000,
    });
    // Unparseable result
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 2000,
      completedAt: 3000,
      result: "not-json",
    });
    // Result without error_code
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 3000,
      completedAt: 4000,
      result: JSON.stringify({ message: "something went wrong" }),
    });

    const result = await t.query(
      api.controlPlaneDashboard.failureDistribution,
      {},
    );

    expect(result.totalFailed).toBe(3);
    expect(result.byActionType.start_orchestration.unknown).toBe(1);
    expect(result.byActionType.start_orchestration.unparseable_result).toBe(1);
    expect(result.byActionType.start_orchestration.unclassified).toBe(1);
  });

  test("respects since filter", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "fail-since");

    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 1000,
      completedAt: 2000,
      result: JSON.stringify({ error_code: "node_offline" }),
    });
    await insertAction(t, {
      orchestrationId,
      actionType: "start_orchestration",
      status: "failed",
      createdAt: 5000,
      completedAt: 6000,
      result: JSON.stringify({ error_code: "invalid_payload" }),
    });

    const result = await t.query(
      api.controlPlaneDashboard.failureDistribution,
      { since: 3000 },
    );

    expect(result.totalFailed).toBe(1);
    expect(result.byActionType.start_orchestration).toEqual({
      invalid_payload: 1,
    });
  });
});
