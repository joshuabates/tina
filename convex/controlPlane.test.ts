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

    // Seed tasks so task_edit/task_set_model can find them
    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Task one" },
        { taskNumber: 2, subject: "Task two" },
        { taskNumber: 3, subject: "Task three" },
      ],
    });

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
      orchestration_set_policy: JSON.stringify({ feature: "test", targetRevision: 0 }),
      orchestration_set_role_model: JSON.stringify({ feature: "test", targetRevision: 1, role: "executor", model: "opus" }),
      task_edit: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, subject: "Updated" }),
      task_insert: JSON.stringify({ feature: "test", phaseNumber: "1", afterTask: 1, subject: "New task" }),
      task_set_model: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 2, revision: 1, model: "haiku" }),
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

  test("task action types require proper payload validation", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    // task_edit with empty payload should now be rejected (requires feature, phaseNumber, etc.)
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "validate-task-edit",
      }),
    ).rejects.toThrow('requires "feature"');
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

describe("controlPlane:enqueueControlAction:policyValidation", () => {
  test("rejects orchestration_set_policy with invalid JSON", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: "not-json",
        requestedBy: "web-ui",
        idempotencyKey: "policy-bad-json",
      }),
    ).rejects.toThrow("Invalid payload: must be valid JSON");
  });

  test("rejects orchestration_set_policy missing feature", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: JSON.stringify({ targetRevision: 0 }),
        requestedBy: "web-ui",
        idempotencyKey: "policy-no-feature",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("rejects orchestration_set_policy missing targetRevision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: JSON.stringify({ feature: "test" }),
        requestedBy: "web-ui",
        idempotencyKey: "policy-no-rev",
      }),
    ).rejects.toThrow('requires "targetRevision"');
  });

  test("rejects orchestration_set_policy with unknown model role", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: JSON.stringify({
          feature: "test",
          targetRevision: 0,
          model: { unknown_role: "opus" },
        }),
        requestedBy: "web-ui",
        idempotencyKey: "policy-bad-role",
      }),
    ).rejects.toThrow('Unknown model role: "unknown_role"');
  });

  test("rejects orchestration_set_policy with invalid model name", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: JSON.stringify({
          feature: "test",
          targetRevision: 0,
          model: { executor: "gpt-4" },
        }),
        requestedBy: "web-ui",
        idempotencyKey: "policy-bad-model",
      }),
    ).rejects.toThrow('Invalid model for "executor"');
  });

  test("accepts valid orchestration_set_policy and increments policyRevision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: JSON.stringify({
        feature: "cp-feature",
        targetRevision: 0,
        review: { enforcement: "task_and_phase" },
      }),
      requestedBy: "web-ui",
      idempotencyKey: "policy-valid",
    });

    expect(actionId).toBeTruthy();

    // Verify policyRevision was incremented
    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(orchestrationId);
    });
    expect(orch!.policyRevision).toBe(1);
  });

  test("rejects orchestration_set_policy with stale revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    // First, successfully set policy at revision 0
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: JSON.stringify({
        feature: "cp-feature",
        targetRevision: 0,
      }),
      requestedBy: "web-ui",
      idempotencyKey: "policy-first",
    });

    // Now try with stale revision 0 (should be 1 now)
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_policy",
        payload: JSON.stringify({
          feature: "cp-feature",
          targetRevision: 0,
        }),
        requestedBy: "web-ui",
        idempotencyKey: "policy-stale",
      }),
    ).rejects.toThrow("Policy revision conflict");
  });

  test("accepts orchestration_set_policy with valid model assignments", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: JSON.stringify({
        feature: "cp-feature",
        targetRevision: 0,
        model: { executor: "opus", reviewer: "sonnet" },
      }),
      requestedBy: "web-ui",
      idempotencyKey: "policy-models",
    });

    expect(actionId).toBeTruthy();
  });
});

describe("controlPlane:enqueueControlAction:roleModelValidation", () => {
  test("rejects orchestration_set_role_model with invalid JSON", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: "not-json",
        requestedBy: "web-ui",
        idempotencyKey: "role-bad-json",
      }),
    ).rejects.toThrow("Invalid payload: must be valid JSON");
  });

  test("rejects orchestration_set_role_model missing feature", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: JSON.stringify({ targetRevision: 0, role: "executor", model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "role-no-feature",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("rejects orchestration_set_role_model missing targetRevision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: JSON.stringify({ feature: "test", role: "executor", model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "role-no-rev",
      }),
    ).rejects.toThrow('requires "targetRevision"');
  });

  test("rejects orchestration_set_role_model with invalid role", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: JSON.stringify({
          feature: "test",
          targetRevision: 0,
          role: "manager",
          model: "opus",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "role-bad-role",
      }),
    ).rejects.toThrow('Invalid role: "manager"');
  });

  test("rejects orchestration_set_role_model with invalid model", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: JSON.stringify({
          feature: "test",
          targetRevision: 0,
          role: "executor",
          model: "gpt-4",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "role-bad-model",
      }),
    ).rejects.toThrow('Invalid model: "gpt-4"');
  });

  test("accepts valid orchestration_set_role_model and increments policyRevision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: JSON.stringify({
        feature: "cp-feature",
        targetRevision: 0,
        role: "executor",
        model: "opus",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "role-valid",
    });

    expect(actionId).toBeTruthy();

    // Verify policyRevision was incremented
    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(orchestrationId);
    });
    expect(orch!.policyRevision).toBe(1);
  });

  test("rejects orchestration_set_role_model with stale revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    // First, successfully set role model at revision 0
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: JSON.stringify({
        feature: "cp-feature",
        targetRevision: 0,
        role: "executor",
        model: "opus",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "role-first",
    });

    // Now try with stale revision 0 (should be 1 now)
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: JSON.stringify({
          feature: "cp-feature",
          targetRevision: 0,
          role: "reviewer",
          model: "haiku",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "role-stale",
      }),
    ).rejects.toThrow("Policy revision conflict");
  });
});

describe("controlPlane:policyReconfiguration:integration", () => {
  test("e2e: set_policy creates action log, queue entry, event, and increments revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: '{"feature":"cp-feature","targetRevision":0,"model":{"executor":"haiku"}}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-policy-001",
    });

    // 1. Control-plane action log
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("orchestration_set_policy");
    expect(actions[0].status).toBe("pending");

    // 2. Queue entry linked back
    const queueAction = await t.run(async (ctx) => {
      return await ctx.db.get(actions[0].queueActionId!);
    });
    expect(queueAction).not.toBeNull();
    expect(queueAction!.controlActionId).toBe(actionId);

    // 3. Audit event
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("orchestration_set_policy");

    // 4. Revision incremented
    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(orchestrationId);
    });
    expect(orch!.policyRevision).toBe(1);
  });

  test("e2e: set_role_model creates action log and increments revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"cp-feature","targetRevision":0,"role":"executor","model":"haiku"}',
      requestedBy: "web:operator",
      idempotencyKey: "e2e-role-001",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("orchestration_set_role_model");

    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(orchestrationId);
    });
    expect(orch!.policyRevision).toBe(1);
  });

  test("sequential policy updates with correct revisions all succeed", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    // First: set executor to haiku (rev 0 -> 1)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"cp-feature","targetRevision":0,"role":"executor","model":"haiku"}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-policy-1",
    });

    // Second: set reviewer to sonnet (rev 1 -> 2)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"cp-feature","targetRevision":1,"role":"reviewer","model":"sonnet"}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-policy-2",
    });

    // Third: full policy set (rev 2 -> 3)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_policy",
      payload: '{"feature":"cp-feature","targetRevision":2,"model":{"executor":"opus","reviewer":"opus"}}',
      requestedBy: "web-ui",
      idempotencyKey: "seq-policy-3",
    });

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(3);

    const orch = await t.run(async (ctx) => {
      return await ctx.db.get(orchestrationId);
    });
    expect(orch!.policyRevision).toBe(3);
  });

  test("concurrent requests with same revision: first wins, second fails", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    // First request succeeds
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "orchestration_set_role_model",
      payload: '{"feature":"cp-feature","targetRevision":0,"role":"executor","model":"haiku"}',
      requestedBy: "user-a",
      idempotencyKey: "concurrent-a",
    });

    // Second request with same revision fails
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "orchestration_set_role_model",
        payload: '{"feature":"cp-feature","targetRevision":0,"role":"reviewer","model":"sonnet"}',
        requestedBy: "user-b",
        idempotencyKey: "concurrent-b",
      }),
    ).rejects.toThrow("Policy revision conflict");
  });
});

describe("controlPlane:enqueueControlAction:taskEditValidation", () => {
  test("rejects task_edit with invalid JSON", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: "not-json",
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-bad-json",
      }),
    ).rejects.toThrow("Invalid payload: must be valid JSON");
  });

  test("rejects task_edit missing feature", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ phaseNumber: "1", taskNumber: 1, revision: 1, subject: "x" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-no-feature",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("rejects task_edit missing phaseNumber", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ feature: "test", taskNumber: 1, revision: 1, subject: "x" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-no-phase",
      }),
    ).rejects.toThrow('requires "phaseNumber"');
  });

  test("rejects task_edit missing taskNumber", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", revision: 1, subject: "x" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-no-tasknum",
      }),
    ).rejects.toThrow('requires "taskNumber"');
  });

  test("rejects task_edit missing revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, subject: "x" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-no-rev",
      }),
    ).rejects.toThrow('requires "revision"');
  });

  test("rejects task_edit with no edit fields", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1 }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-no-fields",
      }),
    ).rejects.toThrow("requires at least one edit field");
  });

  test("rejects task_edit with invalid model", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, model: "gpt-4" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-bad-model",
      }),
    ).rejects.toThrow('Invalid model: "gpt-4"');
  });

  test("rejects task_edit when task not found", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 99, revision: 1, subject: "x" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-not-found",
      }),
    ).rejects.toThrow("Task 99 not found in phase 1");
  });

  test("rejects task_edit when task status is not pending", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Task one" }],
    });

    // Patch task status to in_progress
    await t.run(async (ctx) => {
      const task = await ctx.db
        .query("executionTasks")
        .withIndex("by_orchestration_phase_task", (q) =>
          q.eq("orchestrationId", orchestrationId).eq("phaseNumber", "1").eq("taskNumber", 1),
        )
        .first();
      await ctx.db.patch(task!._id, { status: "in_progress" });
    });

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, subject: "Updated" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-not-pending",
      }),
    ).rejects.toThrow('status is "in_progress" (must be "pending")');
  });

  test("rejects task_edit with stale revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Task one" }],
    });

    // Successfully edit task (revision 1 -> 2)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, subject: "First edit" }),
      requestedBy: "web-ui",
      idempotencyKey: "task-edit-rev1",
    });

    // Try again with stale revision 1 (now 2)
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, subject: "Stale edit" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-stale",
      }),
    ).rejects.toThrow("Task revision conflict");
  });

  test("accepts valid task_edit and patches the task", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Original subject" }],
    });

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({
        feature: "test",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 1,
        subject: "Updated subject",
        description: "New description",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "task-edit-valid",
    });

    expect(actionId).toBeTruthy();

    // Verify task was patched
    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 1,
    });
    expect(task!.subject).toBe("Updated subject");
    expect(task!.description).toBe("New description");
    expect(task!.revision).toBe(2);
  });

  test("task_edit only updates provided fields", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Original", description: "Keep this" }],
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({
        feature: "test",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 1,
        subject: "Changed",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "task-edit-partial",
    });

    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 1,
    });
    expect(task!.subject).toBe("Changed");
    expect(task!.description).toBe("Keep this");
  });
});

describe("controlPlane:enqueueControlAction:taskInsertValidation", () => {
  test("rejects task_insert missing feature", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({ phaseNumber: "1", afterTask: 0, subject: "New" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-no-feature",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("rejects task_insert missing phaseNumber", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({ feature: "test", afterTask: 0, subject: "New" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-no-phase",
      }),
    ).rejects.toThrow('requires "phaseNumber"');
  });

  test("rejects task_insert missing afterTask", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", subject: "New" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-no-after",
      }),
    ).rejects.toThrow('requires "afterTask"');
  });

  test("rejects task_insert missing subject", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", afterTask: 0 }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-no-subject",
      }),
    ).rejects.toThrow('requires "subject"');
  });

  test("rejects task_insert with invalid model", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", afterTask: 0, subject: "New", model: "gpt-4" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-bad-model",
      }),
    ).rejects.toThrow('Invalid model: "gpt-4"');
  });

  test("rejects task_insert with invalid dependsOn type", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", afterTask: 0, subject: "New", dependsOn: "not-array" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-bad-deps",
      }),
    ).rejects.toThrow('"dependsOn" to be an array');
  });

  test("rejects task_insert when afterTask not found", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", afterTask: 99, subject: "New" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-after-not-found",
      }),
    ).rejects.toThrow("afterTask 99 not found in phase 1");
  });

  test("rejects task_insert when dependency not found", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Task one" }],
    });

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", afterTask: 1, subject: "New", dependsOn: [99] }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-dep-not-found",
      }),
    ).rejects.toThrow("Dependency task 99 not found in phase 1");
  });

  test("accepts task_insert at beginning (afterTask: 0) with no existing tasks", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_insert",
      payload: JSON.stringify({ feature: "test", phaseNumber: "1", afterTask: 0, subject: "First task" }),
      requestedBy: "web-ui",
      idempotencyKey: "task-insert-beginning",
    });

    expect(actionId).toBeTruthy();

    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].subject).toBe("First task");
    expect(tasks[0].taskNumber).toBe(1);
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].revision).toBe(1);
    expect(tasks[0].insertedBy).toBe("web-ui");
  });

  test("accepts valid task_insert and assigns max+1 taskNumber", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Task one" },
        { taskNumber: 2, subject: "Task two" },
      ],
    });

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_insert",
      payload: JSON.stringify({
        feature: "test",
        phaseNumber: "1",
        afterTask: 1,
        subject: "Inserted task",
        description: "Inserted desc",
        model: "haiku",
        dependsOn: [1],
      }),
      requestedBy: "web-ui",
      idempotencyKey: "task-insert-valid",
    });

    expect(actionId).toBeTruthy();

    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(tasks).toHaveLength(3);

    const inserted = tasks.find((t) => t.taskNumber === 3);
    expect(inserted).toBeDefined();
    expect(inserted!.subject).toBe("Inserted task");
    expect(inserted!.description).toBe("Inserted desc");
    expect(inserted!.model).toBe("haiku");
    expect(inserted!.dependsOn).toEqual([1]);
    expect(inserted!.insertedBy).toBe("web-ui");
    expect(inserted!.revision).toBe(1);
  });
});

describe("controlPlane:enqueueControlAction:taskSetModelValidation", () => {
  test("rejects task_set_model missing feature", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({ phaseNumber: "1", taskNumber: 1, revision: 1, model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-no-feature",
      }),
    ).rejects.toThrow('requires "feature"');
  });

  test("rejects task_set_model missing phaseNumber", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({ feature: "test", taskNumber: 1, revision: 1, model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-no-phase",
      }),
    ).rejects.toThrow('requires "phaseNumber"');
  });

  test("rejects task_set_model missing taskNumber", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", revision: 1, model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-no-tasknum",
      }),
    ).rejects.toThrow('requires "taskNumber"');
  });

  test("rejects task_set_model missing revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-no-rev",
      }),
    ).rejects.toThrow('requires "revision"');
  });

  test("rejects task_set_model with invalid model", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, model: "gpt-4" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-bad-model",
      }),
    ).rejects.toThrow('Invalid model: "gpt-4"');
  });

  test("rejects task_set_model when task not found", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 99, revision: 1, model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-not-found",
      }),
    ).rejects.toThrow("Task 99 not found in phase 1");
  });

  test("rejects task_set_model when task status is not pending", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Task one" }],
    });

    await t.run(async (ctx) => {
      const task = await ctx.db
        .query("executionTasks")
        .withIndex("by_orchestration_phase_task", (q) =>
          q.eq("orchestrationId", orchestrationId).eq("phaseNumber", "1").eq("taskNumber", 1),
        )
        .first();
      await ctx.db.patch(task!._id, { status: "completed" });
    });

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-not-pending",
      }),
    ).rejects.toThrow('status is "completed" (must be "pending")');
  });

  test("rejects task_set_model with stale revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Task one" }],
    });

    // Successfully set model (revision 1 -> 2)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_set_model",
      payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, model: "haiku" }),
      requestedBy: "web-ui",
      idempotencyKey: "task-model-rev1",
    });

    // Try again with stale revision 1 (now 2)
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, model: "opus" }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-stale",
      }),
    ).rejects.toThrow("Task revision conflict");
  });

  test("accepts valid task_set_model and patches the task", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "cp-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Task one" }],
    });

    const actionId = await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_set_model",
      payload: JSON.stringify({ feature: "test", phaseNumber: "1", taskNumber: 1, revision: 1, model: "haiku" }),
      requestedBy: "web-ui",
      idempotencyKey: "task-model-valid",
    });

    expect(actionId).toBeTruthy();

    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 1,
    });
    expect(task!.model).toBe("haiku");
    expect(task!.revision).toBe(2);
  });
});

describe("controlPlane:taskReconfiguration:integration", () => {
  test("e2e: task_edit creates action log, modifies task, and records event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Original subject" },
        { taskNumber: 2, subject: "Task two" },
        { taskNumber: 3, subject: "Task three" },
      ],
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({
        feature: "cp-feature",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 1,
        subject: "Updated subject",
        model: "haiku",
      }),
      requestedBy: "web:operator",
      idempotencyKey: "e2e-task-edit-001",
    });

    // 1. Action log entry exists with correct actionType
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("task_edit");
    expect(actions[0].status).toBe("pending");
    expect(actions[0].requestedBy).toBe("web:operator");
    expect(actions[0].queueActionId).toBeDefined();

    // 2. Task is modified with new subject/model and incremented revision
    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 1,
    });
    expect(task!.subject).toBe("Updated subject");
    expect(task!.model).toBe("haiku");
    expect(task!.revision).toBe(2);

    // 3. Audit event recorded
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("control_plane");
    expect(events[0].summary).toContain("task_edit");
    expect(events[0].summary).toContain("web:operator");
  });

  test("e2e: task_insert adds task and records audit trail", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Task one" },
        { taskNumber: 2, subject: "Task two" },
        { taskNumber: 3, subject: "Task three" },
      ],
    });

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_insert",
      payload: JSON.stringify({
        feature: "cp-feature",
        phaseNumber: "1",
        afterTask: 2,
        subject: "Inserted task",
      }),
      requestedBy: "web:operator",
      idempotencyKey: "e2e-task-insert-001",
    });

    // 1. 4 tasks exist (3 original + 1 inserted)
    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(tasks).toHaveLength(4);

    // 2. Inserted task has correct taskNumber (max+1 = 4)
    const inserted = tasks.find((t) => t.taskNumber === 4);
    expect(inserted).toBeDefined();
    expect(inserted!.subject).toBe("Inserted task");
    expect(inserted!.insertedBy).toBe("web:operator");

    // 3. Audit event recorded
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("task_insert");
    expect(events[0].summary).toContain("web:operator");
  });

  test("e2e: edit + insert + model override sequence with correct revisions", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(
      t,
      "cp-feature",
    );

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Task one" },
        { taskNumber: 2, subject: "Task two" },
        { taskNumber: 3, subject: "Task three" },
      ],
    });

    // Step 1: Edit task 1 (rev 1 -> 2)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({
        feature: "cp-feature",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 1,
        subject: "Edited task one",
      }),
      requestedBy: "web:operator",
      idempotencyKey: "e2e-seq-edit",
    });

    // Step 2: Insert new task
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_insert",
      payload: JSON.stringify({
        feature: "cp-feature",
        phaseNumber: "1",
        afterTask: 2,
        subject: "New task four",
      }),
      requestedBy: "web:operator",
      idempotencyKey: "e2e-seq-insert",
    });

    // Step 3: Set model on task 3 (rev 1 -> 2)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_set_model",
      payload: JSON.stringify({
        feature: "cp-feature",
        phaseNumber: "1",
        taskNumber: 3,
        revision: 1,
        model: "opus",
      }),
      requestedBy: "web:operator",
      idempotencyKey: "e2e-seq-model",
    });

    // Verify final state: task 1 has updated subject + rev 2
    const task1 = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 1,
    });
    expect(task1!.subject).toBe("Edited task one");
    expect(task1!.revision).toBe(2);

    // New task 4 exists
    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(tasks).toHaveLength(4);
    const task4 = tasks.find((t) => t.taskNumber === 4);
    expect(task4).toBeDefined();
    expect(task4!.subject).toBe("New task four");

    // Task 3 has updated model + rev 2
    const task3 = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 3,
    });
    expect(task3!.model).toBe("opus");
    expect(task3!.revision).toBe(2);

    // 3 action log entries
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(3);

    // 3 audit events
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(3);
  });
});
