import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  createFeatureFixture,
  createLaunchFixture,
  createDesign,
  createProject,
} from "./test_helpers";

// Worktree module discovery: convex-test resolves modules via node_modules,
// which points to the main repo. New modules in this worktree (controlPlane.ts)
// are invisible without an explicit glob rooted here.
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

  test("links inboundActions row back to control action", async () => {
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
      idempotencyKey: "linkage-test",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    const queueActionId = actions[0].queueActionId!;

    // Verify the inbound action links back to the control action
    const inboundAction = await t.run(async (ctx) => {
      return await ctx.db.get(queueActionId);
    });
    expect(inboundAction).not.toBeNull();
    expect(inboundAction!.controlActionId).toBe(actionId);
    expect(inboundAction!.idempotencyKey).toBe("linkage-test");
    expect(inboundAction!.type).toBe("start_orchestration");
    expect(inboundAction!.orchestrationId).toBe(orchestrationId);
    expect(inboundAction!.nodeId).toBe(nodeId);
  });

  test("does not overwrite existing policy snapshot", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"original":"policy"}',
      policySnapshotHash: "hash-original",
      presetOrigin: "original-preset",
      requestedBy: "web-ui",
      idempotencyKey: "first-start",
    });

    // Second call with different idempotency key should not overwrite
    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"overwrite":"attempt"}',
      policySnapshotHash: "hash-overwrite",
      presetOrigin: "new-preset",
      requestedBy: "cli",
      idempotencyKey: "second-start",
    });

    const snapshot = await t.query(api.controlPlane.getLatestPolicySnapshot, {
      orchestrationId,
    });
    expect(snapshot!.policySnapshot).toBe('{"original":"policy"}');
    expect(snapshot!.policySnapshotHash).toBe("hash-original");
    expect(snapshot!.presetOrigin).toBe("original-preset");
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
      payload: '{"feature":"test","phase":"1"}',
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

  test("links inboundActions row back to control action", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"test","phase":"1"}',
      requestedBy: "web-ui",
      idempotencyKey: "enqueue-linkage",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    const queueActionId = actions[0].queueActionId!;

    const inboundAction = await t.run(async (ctx) => {
      return await ctx.db.get(queueActionId);
    });
    expect(inboundAction).not.toBeNull();
    expect(inboundAction!.controlActionId).toBe(actionId);
    expect(inboundAction!.idempotencyKey).toBe("enqueue-linkage");
    expect(inboundAction!.type).toBe("pause");
    expect(inboundAction!.payload).toBe('{"feature":"test","phase":"1"}');
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
      payload: '{"feature":"test"}',
      requestedBy: "web-ui",
      idempotencyKey: "resume-dedup",
    });

    const secondId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"test"}',
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

    const payloads: Record<string, string> = {
      pause: '{"feature":"test","phase":"1"}',
      resume: '{"feature":"test"}',
      retry: '{"feature":"test","phase":"2"}',
      orchestration_set_policy: "{}",
      orchestration_set_role_model: "{}",
      task_edit: "{}",
      task_insert: "{}",
      task_set_model: "{}",
    };

    for (const actionType of runtimeTypes) {
      const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType,
        payload: payloads[actionType] ?? "{}",
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

describe("controlPlane:enqueueControlAction payload validation", () => {
  test("rejects invalid JSON payload for pause", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "pause",
        payload: "not-json",
        requestedBy: "web-ui",
        idempotencyKey: "bad-json-1",
      }),
    ).rejects.toThrow("Invalid payload: must be valid JSON");
  });

  test("rejects payload missing feature for pause", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "pause",
        payload: '{"reason":"test"}',
        requestedBy: "web-ui",
        idempotencyKey: "no-feature-1",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("rejects payload missing phase for pause", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "pause",
        payload: '{"feature":"my-feat"}',
        requestedBy: "web-ui",
        idempotencyKey: "no-phase-pause",
      }),
    ).rejects.toThrow('requires "phase"');
  });

  test("rejects payload missing phase for retry", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "retry",
        payload: '{"feature":"my-feat"}',
        requestedBy: "web-ui",
        idempotencyKey: "no-phase-retry",
      }),
    ).rejects.toThrow('requires "phase"');
  });

  test("rejects payload missing feature for resume", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "resume",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "resume-no-feature",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("accepts valid payload with feature and phase for pause", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"my-feat","phase":"phase-1"}',
      requestedBy: "web-ui",
      idempotencyKey: "valid-pause",
    });

    expect(actionId).toBeTruthy();
  });

  test("accepts valid payload with feature for resume (phase optional)", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"my-feat"}',
      requestedBy: "web-ui",
      idempotencyKey: "valid-resume",
    });

    expect(actionId).toBeTruthy();
  });

  test("records orchestrationEvent audit trail on successful enqueue", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"my-feat","phase":"phase-1"}',
      requestedBy: "web-ui",
      idempotencyKey: "audit-pause",
    });

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("control_plane");
    expect(events[0].summary).toContain("pause");
    expect(events[0].summary).toContain("web-ui");
    expect(events[0].detail).toBe('{"feature":"my-feat","phase":"phase-1"}');
  });

  test("skips validation for non-runtime-control actions", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    // task_edit doesn't require feature/phase validation
    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: '{}',
      requestedBy: "web-ui",
      idempotencyKey: "no-validate-task-edit",
    });

    expect(actionId).toBeTruthy();
  });
});

describe("controlPlane:enqueueControlAction:auditTrail", () => {
  // Single-action audit trail is covered by "records orchestrationEvent audit trail
  // on successful enqueue" in the payload validation block above.

  test("records separate events for multiple actions", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"test","phase":"1"}',
      requestedBy: "web-ui",
      idempotencyKey: "audit-multi-1",
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"test"}',
      requestedBy: "web-ui",
      idempotencyKey: "audit-multi-2",
    });

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(2);
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
      payload: '{"feature":"test","phase":"1"}',
      requestedBy: "web-ui",
      idempotencyKey: "action-1",
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"test"}',
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
        payload: '{"feature":"test","phase":"1"}',
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

describe("controlPlane:startOrchestration schema validation", () => {
  test("rejects nonexistent orchestration ID", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    // Delete the orchestration to make the ID stale
    await t.run(async (ctx) => {
      await ctx.db.delete(orchestrationId);
    });

    await expect(
      t.mutation(api.controlPlane.startOrchestration, {
        orchestrationId,
        nodeId,
        policySnapshot: "{}",
        policySnapshotHash: "hash",
        requestedBy: "web-ui",
        idempotencyKey: "stale-id",
      }),
    ).rejects.toThrow();
  });
});

describe("controlPlane:launchOrchestration", () => {
  test("creates orchestration, action log, queue, and event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      nodeId,
      feature: "my-feature",
      branch: "tina/my-feature",
      totalPhases: 3,
      policyPreset: "balanced",
      requestedBy: "web-ui",
      idempotencyKey: "launch-1",
    });

    expect(result.orchestrationId).toBeTruthy();
    expect(result.actionId).toBeTruthy();

    // Verify orchestration was created with correct fields
    const orchestration = await t.run(async (ctx) => {
      return await ctx.db.get(result.orchestrationId);
    });
    expect(orchestration).not.toBeNull();
    expect(orchestration!.status).toBe("launching");
    expect(orchestration!.featureName).toBe("my-feature");
    expect(orchestration!.policySnapshotHash).toMatch(/^sha256-/);
    expect(orchestration!.presetOrigin).toBe("balanced");
    expect(orchestration!.designOnly).toBe(true);

    // Verify control action was created
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId: result.orchestrationId,
    });
    expect(actions.length).toBe(1);
    expect(actions[0].actionType).toBe("start_orchestration");
  });

  test("rejects nonexistent project", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    // Delete the project to make ID invalid
    await t.run(async (ctx) => {
      await ctx.db.delete(projectId);
    });

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId,
        nodeId,
        feature: "my-feature",
        branch: "tina/my-feature",
        totalPhases: 3,
        policyPreset: "balanced",
        requestedBy: "web-ui",
        idempotencyKey: "launch-bad-project",
      }),
    ).rejects.toThrow("Project not found");
  });

  test("rejects design not belonging to project", async () => {
    const t = convexTest(schema, modules);
    const { nodeId } = await createLaunchFixture(t);

    // Create a second project with its own design
    const projectB = await createProject(t, { name: "Other", repoPath: "/other" });
    const designB = await createDesign(t, { projectId: projectB });

    // Use projectA's fixture but designB from projectB
    const projectA = await createProject(t, { name: "Main", repoPath: "/main" });

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId: projectA,
        designId: designB,
        nodeId,
        feature: "cross-ref",
        branch: "tina/cross-ref",
        totalPhases: 2,
        policyPreset: "balanced",
        requestedBy: "web-ui",
        idempotencyKey: "launch-cross-design",
      }),
    ).rejects.toThrow("does not belong to project");
  });

  test("rejects offline node", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    // Patch lastHeartbeat to old value to simulate offline node
    await t.run(async (ctx) => {
      await ctx.db.patch(nodeId, { lastHeartbeat: Date.now() - 120_000 });
    });

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId,
        nodeId,
        feature: "my-feature",
        branch: "tina/my-feature",
        totalPhases: 3,
        policyPreset: "balanced",
        requestedBy: "web-ui",
        idempotencyKey: "launch-offline",
      }),
    ).rejects.toThrow("offline");
  });

  test("rejects unknown preset name", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    await expect(
      t.mutation(api.controlPlane.launchOrchestration, {
        projectId,
        designId,
        nodeId,
        feature: "my-feature",
        branch: "tina/my-feature",
        totalPhases: 3,
        policyPreset: "turbo",
        requestedBy: "web-ui",
        idempotencyKey: "launch-bad-preset",
      }),
    ).rejects.toThrow("Unknown preset");
  });

  test("designOnly is false when ticketIds provided", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    // Create a ticket for this project
    const ticketId = await t.mutation(api.tickets.createTicket, {
      projectId,
      title: "Implement feature",
      description: "Build the thing",
      priority: "medium",
    });

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      nodeId,
      feature: "ticketed-feature",
      branch: "tina/ticketed-feature",
      totalPhases: 2,
      ticketIds: [ticketId],
      policyPreset: "balanced",
      requestedBy: "web-ui",
      idempotencyKey: "launch-with-tickets",
    });

    const orchestration = await t.run(async (ctx) => {
      return await ctx.db.get(result.orchestrationId);
    });
    expect(orchestration!.designOnly).toBe(false);
  });

  test("idempotency: same key returns same IDs", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    const args = {
      projectId,
      designId,
      nodeId,
      feature: "idem-feature",
      branch: "tina/idem-feature",
      totalPhases: 3,
      policyPreset: "balanced",
      requestedBy: "web-ui",
      idempotencyKey: "launch-dedup",
    };

    const first = await t.mutation(api.controlPlane.launchOrchestration, args);
    const second = await t.mutation(api.controlPlane.launchOrchestration, args);

    expect(first.actionId).toBe(second.actionId);
  });
});

describe("controlPlane:launchOrchestration:integration", () => {
  test("e2e: launch creates orchestration, action-log, queue, and event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, projectId, designId } = await createLaunchFixture(t);

    const result = await t.mutation(api.controlPlane.launchOrchestration, {
      projectId,
      designId,
      nodeId,
      feature: "e2e-launch",
      branch: "tina/e2e-launch",
      totalPhases: 3,
      policyPreset: "strict",
      requestedBy: "web:operator",
      idempotencyKey: "e2e-launch-001",
    });

    // 1. Orchestration record exists with correct fields
    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(result.orchestrationId);
    });
    expect(orch).not.toBeNull();
    expect(orch!.featureName).toBe("e2e-launch");
    expect(orch!.status).toBe("launching");
    expect(orch!.totalPhases).toBe(3);
    expect(orch!.policySnapshot).toBeDefined();
    const policy = JSON.parse(orch!.policySnapshot as string);
    expect(policy.review.test_integrity_profile).toBe("max_strict");
    expect(policy.review.allow_rare_override).toBe(false);

    // 2. Control-plane action log has one entry
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId: result.orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("start_orchestration");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].queueActionId).toBeDefined();

    // 3. Launch event was recorded
    const events = await t.query(api.events.listEvents, {
      orchestrationId: result.orchestrationId,
      eventType: "launch_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("control_plane");
    expect(events[0].summary).toContain("e2e-launch");
  });
});

describe("controlPlane:runtime-controls:integration", () => {
  test("e2e: pause creates action log, queue entry, and event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"cp-feature","phase":"1"}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-pause-001",
    });

    // 1. Control-plane action log
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("pause");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].requestedBy).toBe("web:operator");
    expect(actions[0].queueActionId).toBeDefined();

    // 2. Queue entry linked back
    const queueAction = await t.run(async (ctx) => {
      return await ctx.db.get(actions[0].queueActionId!);
    });
    expect(queueAction).not.toBeNull();
    expect(queueAction!.controlActionId).toBe(actionId);
    expect(queueAction!.type).toBe("pause");

    // 3. Audit event
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("pause");
  });

  test("e2e: resume creates action log, queue entry, and event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"cp-feature"}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-resume-001",
    });

    // 1. Control-plane action log
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("resume");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].requestedBy).toBe("web:operator");
    expect(actions[0].queueActionId).toBeDefined();

    // 2. Queue entry linked back
    const queueAction = await t.run(async (ctx) => {
      return await ctx.db.get(actions[0].queueActionId!);
    });
    expect(queueAction).not.toBeNull();
    expect(queueAction!.controlActionId).toBe(actionId);
    expect(queueAction!.type).toBe("resume");

    // 3. Audit event
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("resume");
  });

  test("e2e: retry creates action log, queue entry, and event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "retry",
      payload: '{"feature":"cp-feature","phase":"2"}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-retry-001",
    });

    // 1. Control-plane action log
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("retry");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].requestedBy).toBe("web:operator");
    expect(actions[0].queueActionId).toBeDefined();

    // 2. Queue entry linked back
    const queueAction = await t.run(async (ctx) => {
      return await ctx.db.get(actions[0].queueActionId!);
    });
    expect(queueAction).not.toBeNull();
    expect(queueAction!.controlActionId).toBe(actionId);
    expect(queueAction!.type).toBe("retry");

    // 3. Audit event
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("retry");
  });

  test("pause + resume sequence maintains correct audit trail", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "pause",
      payload: '{"feature":"cp-feature","phase":"1"}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-pause",
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "resume",
      payload: '{"feature":"cp-feature"}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-resume",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(2);
    // Most recent first (desc order)
    expect(actions[0].actionType).toBe("resume");
    expect(actions[1].actionType).toBe("pause");

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(2);
  });
});

describe("controlPlane:getActivePolicy", () => {
  test("returns null for nonexistent orchestration", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "policy-test");

    await t.run(async (ctx) => {
      await ctx.db.delete(orchestrationId);
    });

    const result = await t.query(api.controlPlane.getActivePolicy, {
      orchestrationId,
    });
    expect(result).toBeNull();
  });

  test("returns null when no supervisor state exists", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "policy-test");

    const result = await t.query(api.controlPlane.getActivePolicy, {
      orchestrationId,
    });
    expect(result).toBeNull();
  });

  test("returns live policy from supervisor state", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "policy-test",
    );

    // Set policy snapshot on orchestration
    await t.mutation(api.controlPlane.startOrchestration, {
      orchestrationId,
      nodeId,
      policySnapshot: '{"launch":"snapshot"}',
      policySnapshotHash: "hash-launch",
      presetOrigin: "balanced",
      requestedBy: "web-ui",
      idempotencyKey: "active-policy-setup",
    });

    // Insert a supervisor state with live policy
    await t.run(async (ctx) => {
      await ctx.db.insert("supervisorStates", {
        nodeId,
        featureName: "policy-test",
        stateJson: JSON.stringify({
          model_policy: { default_model: "opus" },
          review_policy: { hard_block_detectors: true },
        }),
        updatedAt: Date.now(),
      });
    });

    const result = await t.query(api.controlPlane.getActivePolicy, {
      orchestrationId,
    });
    expect(result).not.toBeNull();
    expect(result!.modelPolicy).toEqual({ default_model: "opus" });
    expect(result!.reviewPolicy).toEqual({ hard_block_detectors: true });
    expect(result!.launchSnapshot).toBe('{"launch":"snapshot"}');
    expect(result!.presetOrigin).toBe("balanced");
  });

  test("returns policyRevision from orchestration", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "policy-rev-test",
    );

    // Patch orchestration with a policyRevision
    await t.run(async (ctx) => {
      await ctx.db.patch(orchestrationId, { policyRevision: 5 });
      await ctx.db.insert("supervisorStates", {
        nodeId,
        featureName: "policy-rev-test",
        stateJson: JSON.stringify({
          model_policy: null,
          review_policy: null,
        }),
        updatedAt: Date.now(),
      });
    });

    const result = await t.query(api.controlPlane.getActivePolicy, {
      orchestrationId,
    });
    expect(result).not.toBeNull();
    expect(result!.policyRevision).toBe(5);
  });

  test("defaults policyRevision to 0 when not set", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "policy-no-rev",
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("supervisorStates", {
        nodeId,
        featureName: "policy-no-rev",
        stateJson: JSON.stringify({}),
        updatedAt: Date.now(),
      });
    });

    const result = await t.query(api.controlPlane.getActivePolicy, {
      orchestrationId,
    });
    expect(result).not.toBeNull();
    expect(result!.policyRevision).toBe(0);
  });

  test("returns null for invalid stateJson", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "policy-bad-json",
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("supervisorStates", {
        nodeId,
        featureName: "policy-bad-json",
        stateJson: "not-valid-json{{{",
        updatedAt: Date.now(),
      });
    });

    const result = await t.query(api.controlPlane.getActivePolicy, {
      orchestrationId,
    });
    expect(result).toBeNull();
  });

  test("defaults missing policy fields to null", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "policy-partial",
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("supervisorStates", {
        nodeId,
        featureName: "policy-partial",
        stateJson: JSON.stringify({ some_other_field: true }),
        updatedAt: Date.now(),
      });
    });

    const result = await t.query(api.controlPlane.getActivePolicy, {
      orchestrationId,
    });
    expect(result).not.toBeNull();
    expect(result!.modelPolicy).toBeNull();
    expect(result!.reviewPolicy).toBeNull();
    expect(result!.launchSnapshot).toBeNull();
    expect(result!.presetOrigin).toBeNull();
  });
});
