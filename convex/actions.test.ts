import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("actions:completeAction", () => {
  test("completes an inbound action with success", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "action-test",
    );

    const actionId = await t.mutation(api.actions.submitAction, {
      nodeId,
      orchestrationId,
      type: "test_action",
      payload: '{"key":"value"}',
    });

    await t.mutation(api.actions.completeAction, {
      actionId,
      result: '{"done":true}',
      success: true,
    });

    const action = await t.run(async (ctx) => {
      return await ctx.db.get(actionId);
    });
    expect(action!.status).toBe("completed");
    expect(action!.result).toBe('{"done":true}');
    expect(action!.completedAt).toBeTypeOf("number");
  });

  test("completes an inbound action with failure", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "action-test",
    );

    const actionId = await t.mutation(api.actions.submitAction, {
      nodeId,
      orchestrationId,
      type: "test_action",
      payload: '{}',
    });

    await t.mutation(api.actions.completeAction, {
      actionId,
      result: "error: something went wrong",
      success: false,
    });

    const action = await t.run(async (ctx) => {
      return await ctx.db.get(actionId);
    });
    expect(action!.status).toBe("failed");
    expect(action!.result).toBe("error: something went wrong");
  });

  test("propagates completion to linked controlPlaneActions row on success", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "action-test",
    );

    // Create a control plane action and an inbound action linked to it
    const controlActionId = await t.run(async (ctx) => {
      return await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "start_orchestration",
        payload: '{"key":"value"}',
        requestedBy: "web-ui",
        idempotencyKey: "test-key-1",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    const inboundActionId = await t.run(async (ctx) => {
      return await ctx.db.insert("inboundActions", {
        nodeId,
        orchestrationId,
        type: "start_orchestration",
        payload: '{"key":"value"}',
        status: "claimed",
        createdAt: Date.now(),
        controlActionId,
      });
    });

    await t.mutation(api.actions.completeAction, {
      actionId: inboundActionId,
      result: '{"started":true}',
      success: true,
    });

    // Verify inbound action was completed
    const inboundAction = await t.run(async (ctx) => {
      return await ctx.db.get(inboundActionId);
    });
    expect(inboundAction!.status).toBe("completed");
    expect(inboundAction!.result).toBe('{"started":true}');

    // Verify control plane action was also completed
    const controlAction = await t.run(async (ctx) => {
      return await ctx.db.get(controlActionId);
    });
    expect(controlAction!.status).toBe("completed");
    expect(controlAction!.result).toBe('{"started":true}');
    expect(controlAction!.completedAt).toBeTypeOf("number");
  });

  test("propagates failure to linked controlPlaneActions row", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "action-test",
    );

    const controlActionId = await t.run(async (ctx) => {
      return await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "reconfigure_task",
        payload: '{}',
        requestedBy: "web-ui",
        idempotencyKey: "test-key-2",
        status: "pending",
        createdAt: Date.now(),
      });
    });

    const inboundActionId = await t.run(async (ctx) => {
      return await ctx.db.insert("inboundActions", {
        nodeId,
        orchestrationId,
        type: "reconfigure_task",
        payload: '{}',
        status: "claimed",
        createdAt: Date.now(),
        controlActionId,
      });
    });

    await t.mutation(api.actions.completeAction, {
      actionId: inboundActionId,
      result: "error: task not found",
      success: false,
    });

    const controlAction = await t.run(async (ctx) => {
      return await ctx.db.get(controlActionId);
    });
    expect(controlAction!.status).toBe("failed");
    expect(controlAction!.result).toBe("error: task not found");
    expect(controlAction!.completedAt).toBeTypeOf("number");
  });

  test("does not propagate when no controlActionId is present", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "action-test",
    );

    // Submit via the normal API (no controlActionId)
    const actionId = await t.mutation(api.actions.submitAction, {
      nodeId,
      orchestrationId,
      type: "test_action",
      payload: '{}',
    });

    // Should complete without error even with no linked control action
    await t.mutation(api.actions.completeAction, {
      actionId,
      result: "done",
      success: true,
    });

    const action = await t.run(async (ctx) => {
      return await ctx.db.get(actionId);
    });
    expect(action!.status).toBe("completed");
  });
});
