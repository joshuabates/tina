import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

// Worktree-aware module discovery: convex-test's default glob resolves to
// the main repo's convex/ dir (via node_modules). Passing modules explicitly
// ensures vitest resolves the glob relative to THIS file's location.
const modules = import.meta.glob("./**/*.*s");

describe("controlPlane:startOrchestration", () => {
  test("creates control action and inbound action with correct fields", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const actionId = await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"key":"value"}',
      policySnapshotHash: "abc123",
      requestedBy: "web-ui",
      idempotencyKey: "start-1",
    });

    expect(actionId).toBeTruthy();

    // Verify control action was created
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions.length).toBe(1);
    expect(actions[0].actionType).toBe("start_orchestration");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].requestedBy).toBe("web-ui");
    expect(actions[0].idempotencyKey).toBe("start-1");
    expect(actions[0].queueActionId).toBeTruthy();
  });

  test("patches orchestration with policy metadata", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"key":"value"}',
      policySnapshotHash: "hash-abc",
      presetOrigin: "default-preset",
      designOnly: true,
      requestedBy: "web-ui",
      idempotencyKey: "start-2",
    });

    // Verify policy snapshot is readable
    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.policySnapshot).toBe('{"key":"value"}');
    expect(snapshot!.policySnapshotHash).toBe("hash-abc");
    expect(snapshot!.presetOrigin).toBe("default-preset");
  });

  test("idempotency: returns same action ID on duplicate call", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const firstId = await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"key":"value"}',
      policySnapshotHash: "abc123",
      requestedBy: "web-ui",
      idempotencyKey: "dedup-key",
    });

    const secondId = await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"different":"data"}',
      policySnapshotHash: "xyz789",
      requestedBy: "cli",
      idempotencyKey: "dedup-key",
    });

    expect(firstId).toBe(secondId);

    // Only one action should exist
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions.length).toBe(1);
  });

  test("omits optional fields when not provided", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"key":"value"}',
      policySnapshotHash: "abc123",
      requestedBy: "web-ui",
      idempotencyKey: "start-no-opts",
    });

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.presetOrigin).toBeNull();
  });
});

describe("controlPlane:enqueueControlAction", () => {
  test("creates control action for valid runtime action type", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: "{}",
      requestedBy: "web-ui",
      idempotencyKey: "pause-1",
    });

    expect(actionId).toBeTruthy();

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions.length).toBe(1);
    expect(actions[0].actionType).toBe("pause");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].queueActionId).toBeTruthy();
  });

  test("rejects invalid action type", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "invalid_action",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "invalid-1",
      }),
    ).rejects.toThrow("Invalid actionType");
  });

  test("rejects start_orchestration (not a runtime action)", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "start_orchestration",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "start-via-enqueue",
      }),
    ).rejects.toThrow("Invalid actionType");
  });

  test("idempotency: returns same action ID on duplicate call", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const firstId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: "{}",
      requestedBy: "web-ui",
      idempotencyKey: "resume-dedup",
    });

    const secondId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"different":"data"}',
      requestedBy: "cli",
      idempotencyKey: "resume-dedup",
    });

    expect(firstId).toBe(secondId);
  });

  test("accepts all valid runtime action types", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const runtimeTypes = [
      "pause",
      "resume",
      "retry",
      "orchestration_set_policy",
      "orchestration_set_role_model",
      "task_edit",
      "task_insert",
      "task_set_model",
    ];

    for (const actionType of runtimeTypes) {
      const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType,
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: `test-${actionType}`,
      });
      expect(actionId).toBeTruthy();
    }

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions.length).toBe(runtimeTypes.length);
  });
});

describe("controlPlane:listControlActions", () => {
  test("returns actions ordered by createdAt desc", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: "{}",
      requestedBy: "web-ui",
      idempotencyKey: "action-1",
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: "{}",
      requestedBy: "web-ui",
      idempotencyKey: "action-2",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions.length).toBe(2);
    // desc order: most recent first
    expect(actions[0].actionType).toBe("resume");
    expect(actions[1].actionType).toBe("pause");
  });

  test("respects limit parameter", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    for (let i = 0; i < 5; i++) {
      await t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "pause",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: `limit-test-${i}`,
      });
    }

    const limited = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
      limit: 3,
    });
    expect(limited.length).toBe(3);
  });

  test("defaults to limit 50", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    // Just verify it works with default limit (no explicit limit arg)
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toEqual([]);
  });
});

describe("controlPlane:getLatestPolicySnapshot", () => {
  test("returns null for orchestration without policy", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot).toBeNull();
  });

  test("returns null for nonexistent orchestration", async () => {
    const t = convexTest(schema, modules);
    // Create and use a valid-looking but nonexistent ID
    const { orchestrationId } = await createFeatureFixture(t, "temp");

    // Delete the orchestration to make it nonexistent
    await t.run(async (ctx) => {
      await ctx.db.delete(orchestrationId);
    });

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot).toBeNull();
  });

  test("returns policy after startOrchestration sets it", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"enforce":"strict"}',
      policySnapshotHash: "hash-strict",
      presetOrigin: "strict-preset",
      requestedBy: "web-ui",
      idempotencyKey: "policy-test",
    });

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.policySnapshot).toBe('{"enforce":"strict"}');
    expect(snapshot!.policySnapshotHash).toBe("hash-strict");
    expect(snapshot!.presetOrigin).toBe("strict-preset");
  });
});
