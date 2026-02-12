# Phase 5: Pending Task Reconfiguration (Edit/Insert/Model Override)

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 81f17f4e666923a1c86769ebfa20a9c3ec0d5aea

**Goal:** Support safe task-level reconfiguration for pending/unstarted work. After this phase, operators can edit task subjects, insert new tasks, and override task models from the web UI, with revision-safe optimistic concurrency and full audit trail. Only pending tasks can be modified; in-progress and completed tasks are immutable.

**Architecture:** Adds `executionTasks` table to Convex for canonical mutable task state (separate from the append-only `taskEvents` projection). Extends `controlPlane.ts` with task-specific payload validation and direct `executionTasks` mutation for `task_edit`, `task_insert`, and `task_set_model` action types. Adds daemon dispatch and corresponding `tina-session orchestrate` CLI subcommands. Adds `PendingTaskEditor` component to `tina-web` for inline task editing and insertion with plan diff visualization.

**Phase context:** Phase 1 established `controlPlaneActions` and queue linkage. Phase 2 added `launchOrchestration` with policy snapshots. Phase 3 added runtime controls (pause/resume/retry). Phase 4 added policy reconfiguration with optimistic concurrency. The `task_edit`, `task_insert`, and `task_set_model` action types are already listed in `RUNTIME_ACTION_TYPES` but have no dedicated validation or dispatch — they currently accept any `{}` payload and pass through with no side effects.

---

## Task 1: Add executionTasks table to Convex schema

**Files:**
- `convex/schema.ts`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add the `executionTasks` table definition in `convex/schema.ts` after the `taskEvents` table (~line 69). This table stores the canonical mutable state for each task in the execution plan, separate from the append-only `taskEvents` event stream:

```typescript
  executionTasks: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    taskNumber: v.number(),
    subject: v.string(),
    description: v.optional(v.string()),
    status: v.string(), // pending, in_progress, completed, skipped
    model: v.optional(v.string()), // opus, sonnet, haiku
    dependsOn: v.optional(v.array(v.number())),
    revision: v.number(),
    insertedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_orchestration_phase", ["orchestrationId", "phaseNumber"])
    .index("by_orchestration_phase_task", [
      "orchestrationId",
      "phaseNumber",
      "taskNumber",
    ]),
```

2. Verify Convex type generation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 2: Add executionTasks CRUD mutations and queries

**Files:**
- `convex/executionTasks.ts` (new file)

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Create `convex/executionTasks.ts` with seed, list, and get operations:

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const seedExecutionTasks = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    tasks: v.array(
      v.object({
        taskNumber: v.number(),
        subject: v.string(),
        description: v.optional(v.string()),
        model: v.optional(v.string()),
        dependsOn: v.optional(v.array(v.number())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Check no tasks already exist for this phase (seed is one-time)
    const existing = await ctx.db
      .query("executionTasks")
      .withIndex("by_orchestration_phase", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("phaseNumber", args.phaseNumber),
      )
      .first();
    if (existing) {
      throw new Error(
        `Execution tasks already seeded for phase ${args.phaseNumber}`,
      );
    }

    const now = Date.now();
    const ids: string[] = [];
    for (const task of args.tasks) {
      const id = await ctx.db.insert("executionTasks", {
        orchestrationId: args.orchestrationId,
        phaseNumber: args.phaseNumber,
        taskNumber: task.taskNumber,
        subject: task.subject,
        description: task.description,
        status: "pending",
        model: task.model,
        dependsOn: task.dependsOn,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const listExecutionTasks = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.phaseNumber) {
      return await ctx.db
        .query("executionTasks")
        .withIndex("by_orchestration_phase", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("phaseNumber", args.phaseNumber),
        )
        .collect();
    }
    return await ctx.db
      .query("executionTasks")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();
  },
});

export const getExecutionTask = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    taskNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("executionTasks")
      .withIndex("by_orchestration_phase_task", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("phaseNumber", args.phaseNumber)
          .eq("taskNumber", args.taskNumber),
      )
      .first();
  },
});
```

2. Verify Convex functions compile:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 3: Add task-specific payload validation and mutation in controlPlane.ts

**Files:**
- `convex/controlPlane.ts`

**Model:** opus

**review:** full

**Depends on:** Task 1

### Steps

1. Add task payload interfaces and validation functions after the existing `validateRoleModelPayload` function (~line 125):

```typescript
interface TaskEditPayload {
  feature: string;
  phaseNumber: string;
  taskNumber: number;
  revision: number;
  subject?: string;
  description?: string;
  model?: string;
}

interface TaskInsertPayload {
  feature: string;
  phaseNumber: string;
  afterTask: number;
  subject: string;
  description?: string;
  model?: string;
  dependsOn?: number[];
}

interface TaskSetModelPayload {
  feature: string;
  phaseNumber: string;
  taskNumber: number;
  revision: number;
  model: string;
}

function validateTaskEditPayload(rawPayload: string): TaskEditPayload {
  const parsed = parseBasePayload(rawPayload, "task_edit");

  if (typeof parsed.phaseNumber !== "string" || !parsed.phaseNumber) {
    throw new Error('Payload for "task_edit" requires "phaseNumber" (string)');
  }
  if (typeof parsed.taskNumber !== "number") {
    throw new Error('Payload for "task_edit" requires "taskNumber" (number)');
  }
  if (typeof parsed.revision !== "number") {
    throw new Error('Payload for "task_edit" requires "revision" (number)');
  }

  const hasSubject = typeof parsed.subject === "string";
  const hasDescription = typeof parsed.description === "string";
  const hasModel = typeof parsed.model === "string";
  if (!hasSubject && !hasDescription && !hasModel) {
    throw new Error(
      'Payload for "task_edit" requires at least one edit field: "subject", "description", or "model"',
    );
  }

  if (hasModel) {
    if (
      !(ALLOWED_MODELS as readonly string[]).includes(parsed.model as string)
    ) {
      throw new Error(
        `Invalid model: "${parsed.model}". Allowed: ${ALLOWED_MODELS.join(", ")}`,
      );
    }
  }

  return parsed as unknown as TaskEditPayload;
}

function validateTaskInsertPayload(rawPayload: string): TaskInsertPayload {
  const parsed = parseBasePayload(rawPayload, "task_insert");

  if (typeof parsed.phaseNumber !== "string" || !parsed.phaseNumber) {
    throw new Error(
      'Payload for "task_insert" requires "phaseNumber" (string)',
    );
  }
  if (typeof parsed.afterTask !== "number") {
    throw new Error('Payload for "task_insert" requires "afterTask" (number)');
  }
  if (typeof parsed.subject !== "string" || !parsed.subject) {
    throw new Error('Payload for "task_insert" requires "subject" (string)');
  }
  if (
    parsed.model !== undefined &&
    (typeof parsed.model !== "string" ||
      !(ALLOWED_MODELS as readonly string[]).includes(parsed.model))
  ) {
    throw new Error(
      `Invalid model: "${parsed.model}". Allowed: ${ALLOWED_MODELS.join(", ")}`,
    );
  }
  if (parsed.dependsOn !== undefined && !Array.isArray(parsed.dependsOn)) {
    throw new Error(
      'Payload for "task_insert" requires "dependsOn" to be an array',
    );
  }

  return parsed as unknown as TaskInsertPayload;
}

function validateTaskSetModelPayload(rawPayload: string): TaskSetModelPayload {
  const parsed = parseBasePayload(rawPayload, "task_set_model");

  if (typeof parsed.phaseNumber !== "string" || !parsed.phaseNumber) {
    throw new Error(
      'Payload for "task_set_model" requires "phaseNumber" (string)',
    );
  }
  if (typeof parsed.taskNumber !== "number") {
    throw new Error(
      'Payload for "task_set_model" requires "taskNumber" (number)',
    );
  }
  if (typeof parsed.revision !== "number") {
    throw new Error(
      'Payload for "task_set_model" requires "revision" (number)',
    );
  }
  if (
    typeof parsed.model !== "string" ||
    !(ALLOWED_MODELS as readonly string[]).includes(parsed.model)
  ) {
    throw new Error(
      `Invalid model: "${parsed.model}". Allowed: ${ALLOWED_MODELS.join(", ")}`,
    );
  }

  return parsed as unknown as TaskSetModelPayload;
}
```

Note: `parseBasePayload` is the existing helper that validates JSON parsing, `feature`, and `targetRevision`. For task payloads, `targetRevision` serves as a general base field check but task payloads use `revision` for the task-level concurrency, not `targetRevision`. However, `parseBasePayload` requires `targetRevision` which task payloads don't use. So we need to bypass that check.

Actually, redefine a simpler base parser for task payloads:

```typescript
function parseTaskBasePayload(
  rawPayload: string,
  actionType: string,
): Record<string, unknown> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error("Invalid payload: must be valid JSON");
  }

  if (typeof parsed.feature !== "string" || !parsed.feature) {
    throw new Error(`Payload for "${actionType}" requires "feature" (string)`);
  }

  return parsed;
}
```

Replace the `parseBasePayload` calls in the task validators above with `parseTaskBasePayload`.

2. Wire the task validation and mutation into the `enqueueControlAction` handler. Add new `else if` branches after the `orchestration_set_role_model` block (~line 396):

```typescript
    } else if (args.actionType === "task_edit") {
      const payload = validateTaskEditPayload(args.payload);
      // Find and validate the task
      const task = await ctx.db
        .query("executionTasks")
        .withIndex("by_orchestration_phase_task", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("phaseNumber", payload.phaseNumber)
            .eq("taskNumber", payload.taskNumber),
        )
        .first();
      if (!task) {
        throw new Error(
          `Task ${payload.taskNumber} not found in phase ${payload.phaseNumber}`,
        );
      }
      if (task.status !== "pending") {
        throw new Error(
          `Cannot edit task ${payload.taskNumber}: status is "${task.status}" (must be "pending")`,
        );
      }
      if (task.revision !== payload.revision) {
        throw new Error(
          `Task revision conflict: expected ${payload.revision}, current is ${task.revision}. Reload and retry.`,
        );
      }
      // Apply edits
      const patch: Record<string, unknown> = {
        revision: task.revision + 1,
        updatedAt: Date.now(),
      };
      if (payload.subject !== undefined) patch.subject = payload.subject;
      if (payload.description !== undefined)
        patch.description = payload.description;
      if (payload.model !== undefined) patch.model = payload.model;
      await ctx.db.patch(task._id, patch);
    } else if (args.actionType === "task_insert") {
      const payload = validateTaskInsertPayload(args.payload);
      // Verify afterTask exists (or is 0 for "insert at beginning")
      if (payload.afterTask > 0) {
        const afterTask = await ctx.db
          .query("executionTasks")
          .withIndex("by_orchestration_phase_task", (q) =>
            q
              .eq("orchestrationId", args.orchestrationId)
              .eq("phaseNumber", payload.phaseNumber)
              .eq("taskNumber", payload.afterTask),
          )
          .first();
        if (!afterTask) {
          throw new Error(
            `afterTask ${payload.afterTask} not found in phase ${payload.phaseNumber}`,
          );
        }
      }
      // Validate dependency references exist
      if (payload.dependsOn) {
        for (const dep of payload.dependsOn) {
          const depTask = await ctx.db
            .query("executionTasks")
            .withIndex("by_orchestration_phase_task", (q) =>
              q
                .eq("orchestrationId", args.orchestrationId)
                .eq("phaseNumber", payload.phaseNumber)
                .eq("taskNumber", dep),
            )
            .first();
          if (!depTask) {
            throw new Error(
              `Dependency task ${dep} not found in phase ${payload.phaseNumber}`,
            );
          }
        }
      }
      // Determine new task number: find max and add 1
      const allTasks = await ctx.db
        .query("executionTasks")
        .withIndex("by_orchestration_phase", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("phaseNumber", payload.phaseNumber),
        )
        .collect();
      const maxTaskNumber = allTasks.reduce(
        (max, t) => Math.max(max, t.taskNumber),
        0,
      );
      const newTaskNumber = maxTaskNumber + 1;

      const now = Date.now();
      await ctx.db.insert("executionTasks", {
        orchestrationId: args.orchestrationId,
        phaseNumber: payload.phaseNumber,
        taskNumber: newTaskNumber,
        subject: payload.subject,
        description: payload.description,
        status: "pending",
        model: payload.model,
        dependsOn: payload.dependsOn,
        revision: 1,
        insertedBy: args.requestedBy,
        createdAt: now,
        updatedAt: now,
      });
    } else if (args.actionType === "task_set_model") {
      const payload = validateTaskSetModelPayload(args.payload);
      const task = await ctx.db
        .query("executionTasks")
        .withIndex("by_orchestration_phase_task", (q) =>
          q
            .eq("orchestrationId", args.orchestrationId)
            .eq("phaseNumber", payload.phaseNumber)
            .eq("taskNumber", payload.taskNumber),
        )
        .first();
      if (!task) {
        throw new Error(
          `Task ${payload.taskNumber} not found in phase ${payload.phaseNumber}`,
        );
      }
      if (task.status !== "pending") {
        throw new Error(
          `Cannot modify task ${payload.taskNumber}: status is "${task.status}" (must be "pending")`,
        );
      }
      if (task.revision !== payload.revision) {
        throw new Error(
          `Task revision conflict: expected ${payload.revision}, current is ${task.revision}. Reload and retry.`,
        );
      }
      await ctx.db.patch(task._id, {
        model: payload.model,
        revision: task.revision + 1,
        updatedAt: Date.now(),
      });
    }
```

3. Remove the existing "skips validation" test behavior for task_edit/task_insert/task_set_model. These will now be properly validated.

4. Verify Convex functions compile:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx convex typecheck`
Expected: No errors.

---

## Task 4: Add Convex tests for task reconfiguration validation and invariants

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 2, Task 3

### Steps

1. Update the existing "accepts all valid runtime action types" test (~line 346-355) to use valid payloads for task_* types. Replace the three task_* entries in the `payloads` record:

```typescript
      task_edit: JSON.stringify({
        feature: "test",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 1,
        subject: "Updated task",
      }),
      task_insert: JSON.stringify({
        feature: "test",
        phaseNumber: "1",
        afterTask: 0,
        subject: "New task",
      }),
      task_set_model: JSON.stringify({
        feature: "test",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 2,
        model: "haiku",
      }),
```

Since task actions now look up executionTasks, we need to seed tasks before running the "accepts all valid runtime action types" test. Add a seed call before the for loop:

```typescript
    // Seed execution tasks so task_edit/task_insert/task_set_model can find them
    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Task one" },
        { taskNumber: 2, subject: "Task two" },
      ],
    });
```

Note: `task_edit` revision 1, `task_set_model` revision 2 (after edit increments it). The loop runs in order: pause, resume, retry, orchestration_set_policy, orchestration_set_role_model, task_edit, task_insert, task_set_model. So task_edit (revision 1→2) runs before task_set_model (revision 2→3).

2. Update the "skips validation for non-runtime-control actions" test since task_edit now requires validation. Change it to test that task actions properly validate:

Replace the test body with a test for a different concept (or remove it since it's now covered by the task validation tests below).

3. Add a new describe block for task reconfiguration tests:

```typescript
describe("controlPlane:taskReconfiguration", () => {
  async function seedTasks(
    t: ReturnType<typeof convexTest>,
    orchestrationId: string,
    phaseNumber = "1",
  ) {
    return await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId: orchestrationId as any,
      phaseNumber,
      tasks: [
        { taskNumber: 1, subject: "First task", model: "opus" },
        { taskNumber: 2, subject: "Second task", model: "opus", dependsOn: [1] },
        { taskNumber: 3, subject: "Third task", model: "haiku" },
      ],
    });
  }

  test("task_edit rejects missing phaseNumber", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");

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

  test("task_edit rejects missing revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");

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

  test("task_edit rejects when no edit fields provided", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");

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

  test("task_edit rejects nonexistent task", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({
          feature: "task-feat",
          phaseNumber: "1",
          taskNumber: 99,
          revision: 1,
          subject: "Updated",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-missing",
      }),
    ).rejects.toThrow("not found");
  });

  test("task_edit rejects non-pending task", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    // Mark task 1 as in_progress
    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 1,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(task!._id, { status: "in_progress" });
    });

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({
          feature: "task-feat",
          phaseNumber: "1",
          taskNumber: 1,
          revision: 1,
          subject: "Updated",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-in-progress",
      }),
    ).rejects.toThrow('status is "in_progress"');
  });

  test("task_edit rejects stale revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    // First edit succeeds
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({
        feature: "task-feat",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 1,
        subject: "First edit",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "task-edit-rev-1",
    });

    // Second edit with stale revision fails
    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_edit",
        payload: JSON.stringify({
          feature: "task-feat",
          phaseNumber: "1",
          taskNumber: 1,
          revision: 1,
          subject: "Stale edit",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "task-edit-rev-stale",
      }),
    ).rejects.toThrow("Task revision conflict");
  });

  test("task_edit succeeds and increments revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({
        feature: "task-feat",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 1,
        subject: "Updated subject",
        model: "haiku",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "task-edit-success",
    });

    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 1,
    });
    expect(task!.subject).toBe("Updated subject");
    expect(task!.model).toBe("haiku");
    expect(task!.revision).toBe(2);
  });

  test("task_insert creates task after specified task", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_insert",
      payload: JSON.stringify({
        feature: "task-feat",
        phaseNumber: "1",
        afterTask: 2,
        subject: "Inserted remediation task",
        model: "opus",
        dependsOn: [2],
      }),
      requestedBy: "web-ui",
      idempotencyKey: "task-insert-1",
    });

    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(tasks).toHaveLength(4);
    const inserted = tasks.find((t) => t.subject === "Inserted remediation task");
    expect(inserted).not.toBeNull();
    expect(inserted!.taskNumber).toBe(4); // max(3) + 1
    expect(inserted!.dependsOn).toEqual([2]);
    expect(inserted!.insertedBy).toBe("web-ui");
    expect(inserted!.revision).toBe(1);
    expect(inserted!.status).toBe("pending");
  });

  test("task_insert rejects nonexistent afterTask", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({
          feature: "task-feat",
          phaseNumber: "1",
          afterTask: 99,
          subject: "Bad insert",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-bad-after",
      }),
    ).rejects.toThrow("afterTask 99 not found");
  });

  test("task_insert rejects nonexistent dependency", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_insert",
        payload: JSON.stringify({
          feature: "task-feat",
          phaseNumber: "1",
          afterTask: 1,
          subject: "Bad dep insert",
          dependsOn: [99],
        }),
        requestedBy: "web-ui",
        idempotencyKey: "task-insert-bad-dep",
      }),
    ).rejects.toThrow("Dependency task 99 not found");
  });

  test("task_set_model rejects invalid model", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({
          feature: "task-feat",
          phaseNumber: "1",
          taskNumber: 1,
          revision: 1,
          model: "gpt-4",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-bad",
      }),
    ).rejects.toThrow("Invalid model");
  });

  test("task_set_model succeeds and increments revision", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_set_model",
      payload: JSON.stringify({
        feature: "task-feat",
        phaseNumber: "1",
        taskNumber: 2,
        revision: 1,
        model: "haiku",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "task-model-success",
    });

    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 2,
    });
    expect(task!.model).toBe("haiku");
    expect(task!.revision).toBe(2);
  });

  test("task_set_model rejects completed task", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-feat");
    await seedTasks(t, orchestrationId);

    // Mark task 3 as completed
    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 3,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(task!._id, { status: "completed" });
    });

    await expect(
      t.mutation(api.controlPlane.enqueueControlAction, {
        orchestrationId,
        nodeId,
        actionType: "task_set_model",
        payload: JSON.stringify({
          feature: "task-feat",
          phaseNumber: "1",
          taskNumber: 3,
          revision: 1,
          model: "haiku",
        }),
        requestedBy: "web-ui",
        idempotencyKey: "task-model-completed",
      }),
    ).rejects.toThrow('status is "completed"');
  });
});
```

4. Run all Convex tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All tests pass.

---

## Task 5: Add Convex tests for executionTasks CRUD

**Files:**
- `convex/executionTasks.test.ts` (new file)

**Model:** opus

**review:** spec-only

**Depends on:** Task 2

### Steps

1. Create `convex/executionTasks.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("executionTasks:seedExecutionTasks", () => {
  test("seeds tasks for a phase", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "seed-test");

    const ids = await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Task A", model: "opus" },
        { taskNumber: 2, subject: "Task B", dependsOn: [1] },
      ],
    });

    expect(ids).toHaveLength(2);

    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(tasks).toHaveLength(2);
    expect(tasks[0].subject).toBe("Task A");
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].revision).toBe(1);
    expect(tasks[1].dependsOn).toEqual([1]);
  });

  test("rejects double seeding for same phase", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "seed-test");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Task A" }],
    });

    await expect(
      t.mutation(api.executionTasks.seedExecutionTasks, {
        orchestrationId,
        phaseNumber: "1",
        tasks: [{ taskNumber: 2, subject: "Task B" }],
      }),
    ).rejects.toThrow("already seeded");
  });

  test("allows seeding different phases", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "seed-test");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Phase 1 Task" }],
    });

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "2",
      tasks: [{ taskNumber: 1, subject: "Phase 2 Task" }],
    });

    const phase1 = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    const phase2 = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "2",
    });
    expect(phase1).toHaveLength(1);
    expect(phase2).toHaveLength(1);
  });
});

describe("executionTasks:listExecutionTasks", () => {
  test("lists all tasks for orchestration", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "list-test");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "T1" }],
    });
    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "2",
      tasks: [{ taskNumber: 1, subject: "T2" }],
    });

    const all = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
    });
    expect(all).toHaveLength(2);
  });

  test("filters by phaseNumber", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "list-test");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "T1" },
        { taskNumber: 2, subject: "T2" },
      ],
    });
    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "2",
      tasks: [{ taskNumber: 1, subject: "T3" }],
    });

    const phase1 = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(phase1).toHaveLength(2);
  });
});

describe("executionTasks:getExecutionTask", () => {
  test("returns task by orchestration, phase, and task number", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "get-test");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Alpha" },
        { taskNumber: 2, subject: "Beta" },
      ],
    });

    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 2,
    });
    expect(task).not.toBeNull();
    expect(task!.subject).toBe("Beta");
  });

  test("returns null for nonexistent task", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "get-test");

    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 99,
    });
    expect(task).toBeNull();
  });
});
```

2. Run executionTasks tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/executionTasks.test.ts`
Expected: All tests pass.

---

## Task 6: Add daemon dispatch for task action types

**Files:**
- `tina-daemon/src/actions.rs`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add task-specific fields to the `ActionPayload` struct (after the existing `model` field, ~line 26):

```rust
    // Task reconfiguration fields
    pub phase_number: Option<String>,
    pub task_number: Option<u32>,
    pub after_task: Option<u32>,
    pub subject: Option<String>,
    pub description: Option<String>,
    pub revision: Option<u32>,
    pub depends_on: Option<Vec<u32>>,
```

2. Add match arms for the three task action types in `build_cli_args` (before the `other => bail!("unknown action type: {}", other)` arm, ~line 343):

```rust
        "task_edit" => {
            let phase_number = payload.phase_number.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_edit requires 'phase_number' in payload")
            })?;
            let task_number = payload.task_number.ok_or_else(|| {
                anyhow::anyhow!("task_edit requires 'task_number' in payload")
            })?;
            let revision = payload.revision.ok_or_else(|| {
                anyhow::anyhow!("task_edit requires 'revision' in payload")
            })?;

            let mut args = vec![
                "orchestrate".to_string(),
                "task-edit".to_string(),
                "--feature".to_string(),
                feature.to_string(),
                "--phase".to_string(),
                phase_number.to_string(),
                "--task".to_string(),
                task_number.to_string(),
                "--revision".to_string(),
                revision.to_string(),
            ];
            if let Some(ref subject) = payload.subject {
                args.push("--subject".to_string());
                args.push(subject.clone());
            }
            if let Some(ref description) = payload.description {
                args.push("--description".to_string());
                args.push(description.clone());
            }
            if let Some(ref model) = payload.model {
                args.push("--model".to_string());
                args.push(model.clone());
            }
            Ok(args)
        }
        "task_insert" => {
            let phase_number = payload.phase_number.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_insert requires 'phase_number' in payload")
            })?;
            let after_task = payload.after_task.ok_or_else(|| {
                anyhow::anyhow!("task_insert requires 'after_task' in payload")
            })?;
            let subject = payload.subject.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_insert requires 'subject' in payload")
            })?;

            let mut args = vec![
                "orchestrate".to_string(),
                "task-insert".to_string(),
                "--feature".to_string(),
                feature.to_string(),
                "--phase".to_string(),
                phase_number.to_string(),
                "--after-task".to_string(),
                after_task.to_string(),
                "--subject".to_string(),
                subject.to_string(),
            ];
            if let Some(ref model) = payload.model {
                args.push("--model".to_string());
                args.push(model.clone());
            }
            if let Some(ref deps) = payload.depends_on {
                args.push("--depends-on".to_string());
                args.push(
                    deps.iter()
                        .map(|d| d.to_string())
                        .collect::<Vec<_>>()
                        .join(","),
                );
            }
            Ok(args)
        }
        "task_set_model" => {
            let phase_number = payload.phase_number.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_set_model requires 'phase_number' in payload")
            })?;
            let task_number = payload.task_number.ok_or_else(|| {
                anyhow::anyhow!("task_set_model requires 'task_number' in payload")
            })?;
            let revision = payload.revision.ok_or_else(|| {
                anyhow::anyhow!("task_set_model requires 'revision' in payload")
            })?;
            let model = payload.model.as_deref().ok_or_else(|| {
                anyhow::anyhow!("task_set_model requires 'model' in payload")
            })?;

            Ok(vec![
                "orchestrate".to_string(),
                "task-set-model".to_string(),
                "--feature".to_string(),
                feature.to_string(),
                "--phase".to_string(),
                phase_number.to_string(),
                "--task".to_string(),
                task_number.to_string(),
                "--revision".to_string(),
                revision.to_string(),
                "--model".to_string(),
                model.to_string(),
            ])
        }
```

3. Update both `payload()` and `launch_payload()` test helpers to include the new fields (add `None` for each):

```rust
            phase_number: None,
            task_number: None,
            after_task: None,
            subject: None,
            description: None,
            revision: None,
            depends_on: None,
```

4. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && cargo check --manifest-path tina-daemon/Cargo.toml`
Expected: Compiles with no errors.

---

## Task 7: Add daemon tests for task action dispatch

**Files:**
- `tina-daemon/src/actions.rs`

**Model:** opus

**review:** spec-only

**Depends on:** Task 6

### Steps

1. Add tests for task action CLI arg building in the existing test module:

```rust
    #[test]
    fn test_task_edit_basic() {
        let mut p = payload("auth", None);
        p.phase_number = Some("2".to_string());
        p.task_number = Some(3);
        p.revision = Some(1);
        p.subject = Some("Updated subject".to_string());
        let args = build_cli_args("task_edit", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-edit",
                "--feature",
                "auth",
                "--phase",
                "2",
                "--task",
                "3",
                "--revision",
                "1",
                "--subject",
                "Updated subject",
            ]
        );
    }

    #[test]
    fn test_task_edit_with_model() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(1);
        p.revision = Some(2);
        p.model = Some("haiku".to_string());
        let args = build_cli_args("task_edit", &p).unwrap();
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"haiku".to_string()));
    }

    #[test]
    fn test_task_edit_missing_phase() {
        let mut p = payload("auth", None);
        p.task_number = Some(1);
        p.revision = Some(1);
        let result = build_cli_args("task_edit", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("phase_number"));
    }

    #[test]
    fn test_task_insert_basic() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.after_task = Some(2);
        p.subject = Some("New task".to_string());
        p.model = Some("opus".to_string());
        p.depends_on = Some(vec![1, 2]);
        let args = build_cli_args("task_insert", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-insert",
                "--feature",
                "auth",
                "--phase",
                "1",
                "--after-task",
                "2",
                "--subject",
                "New task",
                "--model",
                "opus",
                "--depends-on",
                "1,2",
            ]
        );
    }

    #[test]
    fn test_task_insert_missing_subject() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.after_task = Some(1);
        let result = build_cli_args("task_insert", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("subject"));
    }

    #[test]
    fn test_task_set_model_basic() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(2);
        p.revision = Some(3);
        p.model = Some("haiku".to_string());
        let args = build_cli_args("task_set_model", &p).unwrap();
        assert_eq!(
            args,
            vec![
                "orchestrate",
                "task-set-model",
                "--feature",
                "auth",
                "--phase",
                "1",
                "--task",
                "2",
                "--revision",
                "3",
                "--model",
                "haiku",
            ]
        );
    }

    #[test]
    fn test_task_set_model_missing_model() {
        let mut p = payload("auth", None);
        p.phase_number = Some("1".to_string());
        p.task_number = Some(1);
        p.revision = Some(1);
        let result = build_cli_args("task_set_model", &p);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("model"));
    }
```

2. Run the daemon tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && cargo test --manifest-path tina-daemon/Cargo.toml`
Expected: All tests pass.

---

## Task 8: Add tina-session task reconfiguration commands

**Files:**
- `tina-session/src/main.rs`
- `tina-session/src/commands/orchestrate.rs`

**Model:** opus

**review:** full

**Depends on:** none

### Steps

1. Add `TaskEdit`, `TaskInsert`, and `TaskSetModel` variants to the `OrchestrateCommands` enum in `main.rs` (after the `SetRoleModel` variant, ~line 608):

```rust
    /// Edit a pending execution task
    TaskEdit {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: String,

        /// Task number to edit
        #[arg(long)]
        task: u32,

        /// Expected revision for optimistic concurrency
        #[arg(long)]
        revision: u32,

        /// New subject (optional)
        #[arg(long)]
        subject: Option<String>,

        /// New description (optional)
        #[arg(long)]
        description: Option<String>,

        /// New model (optional: opus, sonnet, haiku)
        #[arg(long)]
        model: Option<String>,
    },

    /// Insert a new task into the execution plan
    TaskInsert {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: String,

        /// Insert after this task number (0 for beginning)
        #[arg(long)]
        after_task: u32,

        /// Task subject
        #[arg(long)]
        subject: String,

        /// Model (optional: opus, sonnet, haiku)
        #[arg(long)]
        model: Option<String>,

        /// Comma-separated dependency task numbers
        #[arg(long)]
        depends_on: Option<String>,
    },

    /// Override the model for a specific pending task
    TaskSetModel {
        /// Feature name
        #[arg(long)]
        feature: String,

        /// Phase number
        #[arg(long)]
        phase: String,

        /// Task number
        #[arg(long)]
        task: u32,

        /// Expected revision for optimistic concurrency
        #[arg(long)]
        revision: u32,

        /// New model (opus, sonnet, haiku)
        #[arg(long)]
        model: String,
    },
```

2. Add match arms for the new commands in the main dispatch (after the `SetRoleModel` arm, ~line 1210):

```rust
            OrchestrateCommands::TaskEdit {
                feature,
                phase,
                task,
                revision,
                subject,
                description,
                model,
            } => commands::orchestrate::task_edit(
                &feature, &phase, task, revision,
                subject.as_deref(), description.as_deref(), model.as_deref(),
            ),
            OrchestrateCommands::TaskInsert {
                feature,
                phase,
                after_task,
                subject,
                model,
                depends_on,
            } => commands::orchestrate::task_insert(
                &feature, &phase, after_task, &subject,
                model.as_deref(), depends_on.as_deref(),
            ),
            OrchestrateCommands::TaskSetModel {
                feature,
                phase,
                task,
                revision,
                model,
            } => commands::orchestrate::task_set_model(&feature, &phase, task, revision, &model),
```

3. Add the implementation functions in `tina-session/src/commands/orchestrate.rs`. These are acknowledgment commands that confirm the task modification (the actual mutation happened in the Convex mutation). Add before the `sync_to_convex_with_telemetry` function:

```rust
/// Acknowledge a task edit (mutation already applied in Convex).
pub fn task_edit(
    feature: &str,
    phase: &str,
    task_number: u32,
    revision: u32,
    subject: Option<&str>,
    description: Option<&str>,
    model: Option<&str>,
) -> anyhow::Result<u8> {
    let output = serde_json::json!({
        "success": true,
        "action": "task_edit",
        "feature": feature,
        "phase": phase,
        "task_number": task_number,
        "revision": revision,
        "subject": subject,
        "description": description,
        "model": model,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}

/// Acknowledge a task insertion (mutation already applied in Convex).
pub fn task_insert(
    feature: &str,
    phase: &str,
    after_task: u32,
    subject: &str,
    model: Option<&str>,
    depends_on: Option<&str>,
) -> anyhow::Result<u8> {
    let output = serde_json::json!({
        "success": true,
        "action": "task_insert",
        "feature": feature,
        "phase": phase,
        "after_task": after_task,
        "subject": subject,
        "model": model,
        "depends_on": depends_on,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}

/// Acknowledge a task model override (mutation already applied in Convex).
pub fn task_set_model(
    feature: &str,
    phase: &str,
    task_number: u32,
    revision: u32,
    model: &str,
) -> anyhow::Result<u8> {
    let output = serde_json::json!({
        "success": true,
        "action": "task_set_model",
        "feature": feature,
        "phase": phase,
        "task_number": task_number,
        "revision": revision,
        "model": model,
    });
    println!("{}", serde_json::to_string(&output)?);
    Ok(0)
}
```

4. Verify compilation:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && cargo check --manifest-path tina-session/Cargo.toml`
Expected: Compiles with no errors.

---

## Task 9: Add PendingTaskEditor web component

**Files:**
- `tina-web/src/components/PendingTaskEditor.tsx` (new file)

**Model:** opus

**review:** full

**Depends on:** Task 2, Task 3

### Steps

1. Create `tina-web/src/components/PendingTaskEditor.tsx`:

```tsx
import { useState, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { generateIdempotencyKey } from "@/lib/utils"
import { StatPanel } from "@/components/ui/stat-panel"
import { MonoText } from "@/components/ui/mono-text"

const MODEL_OPTIONS = ["opus", "sonnet", "haiku"] as const

interface PendingTaskEditorProps {
  orchestrationId: string
  nodeId: string
  featureName: string
  phaseNumber: string
}

export function PendingTaskEditor({
  orchestrationId,
  nodeId,
  featureName,
  phaseNumber,
}: PendingTaskEditorProps) {
  const tasks = useQuery(api.executionTasks.listExecutionTasks, {
    orchestrationId: orchestrationId as Id<"orchestrations">,
    phaseNumber,
  })

  const enqueueAction = useMutation(api.controlPlane.enqueueControlAction)
  const [pendingTaskNum, setPendingTaskNum] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [insertFormOpen, setInsertFormOpen] = useState(false)
  const [insertSubject, setInsertSubject] = useState("")
  const [insertModel, setInsertModel] = useState<string>("opus")
  const [insertAfterTask, setInsertAfterTask] = useState(0)

  const handleModelChange = useCallback(
    async (taskNumber: number, revision: number, newModel: string) => {
      setPendingTaskNum(taskNumber)
      setError(null)
      setSuccess(null)

      try {
        await enqueueAction({
          orchestrationId: orchestrationId as Id<"orchestrations">,
          nodeId: nodeId as Id<"nodes">,
          actionType: "task_set_model",
          payload: JSON.stringify({
            feature: featureName,
            phaseNumber,
            taskNumber,
            revision,
            model: newModel,
          }),
          requestedBy: "web-ui",
          idempotencyKey: generateIdempotencyKey(),
        })
        setSuccess(`Task ${taskNumber} → ${newModel}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed")
      } finally {
        setPendingTaskNum(null)
      }
    },
    [enqueueAction, orchestrationId, nodeId, featureName, phaseNumber],
  )

  const handleInsert = useCallback(async () => {
    if (!insertSubject.trim()) return
    setError(null)
    setSuccess(null)

    try {
      await enqueueAction({
        orchestrationId: orchestrationId as Id<"orchestrations">,
        nodeId: nodeId as Id<"nodes">,
        actionType: "task_insert",
        payload: JSON.stringify({
          feature: featureName,
          phaseNumber,
          afterTask: insertAfterTask,
          subject: insertSubject.trim(),
          model: insertModel,
        }),
        requestedBy: "web-ui",
        idempotencyKey: generateIdempotencyKey(),
      })
      setSuccess(`Inserted: ${insertSubject.trim()}`)
      setInsertSubject("")
      setInsertFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insert failed")
    }
  }, [
    enqueueAction,
    orchestrationId,
    nodeId,
    featureName,
    phaseNumber,
    insertAfterTask,
    insertSubject,
    insertModel,
  ])

  if (!tasks) {
    return (
      <StatPanel title="Execution Tasks">
        <MonoText className="text-[8px] text-muted-foreground">Loading...</MonoText>
      </StatPanel>
    )
  }

  if (tasks.length === 0) {
    return (
      <StatPanel title="Execution Tasks">
        <MonoText className="text-[8px] text-muted-foreground">
          No execution tasks seeded for phase {phaseNumber}
        </MonoText>
      </StatPanel>
    )
  }

  const pendingTasks = tasks.filter((t) => t.status === "pending")
  const nonPendingTasks = tasks.filter((t) => t.status !== "pending")

  const controlBtnClass =
    "px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground disabled:opacity-40 disabled:pointer-events-none"

  return (
    <StatPanel title="Execution Tasks">
      <div className="space-y-2">
        <MonoText className="text-[7px] text-muted-foreground/70 uppercase tracking-wider">
          Phase {phaseNumber} — {tasks.length} tasks ({pendingTasks.length} editable)
        </MonoText>

        {error && (
          <div className="text-[7px] text-status-blocked truncate" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="text-[7px] text-emerald-400 truncate" role="status">
            {success}
          </div>
        )}

        <div className="space-y-1">
          {tasks.map((task) => {
            const isPending = task.status === "pending"
            const isInserted = !!task.insertedBy
            return (
              <div
                key={task._id}
                className="flex items-center gap-1.5 py-0.5"
                data-testid={`exec-task-${task.taskNumber}`}
              >
                <MonoText className="text-[8px] text-muted-foreground/60 w-4 text-right">
                  {task.taskNumber}
                </MonoText>
                <div className="flex-1 min-w-0">
                  <MonoText className="text-[8px] text-foreground truncate block">
                    {isInserted && <span className="text-amber-400 mr-1">+</span>}
                    {task.subject}
                  </MonoText>
                </div>
                {isPending ? (
                  <select
                    className="text-[7px] bg-muted/45 border border-border/70 rounded px-1 py-0.5 text-foreground"
                    value={task.model ?? "opus"}
                    onChange={(e) =>
                      handleModelChange(task.taskNumber, task.revision, e.target.value)
                    }
                    disabled={pendingTaskNum !== null}
                    data-testid={`task-model-${task.taskNumber}`}
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <MonoText className="text-[7px] text-muted-foreground/50">
                    {task.status}
                  </MonoText>
                )}
              </div>
            )
          })}
        </div>

        {pendingTaskNum !== null && (
          <MonoText className="text-[7px] text-muted-foreground animate-pulse">
            Updating task {pendingTaskNum}...
          </MonoText>
        )}

        {!insertFormOpen ? (
          <button
            className={controlBtnClass}
            onClick={() => setInsertFormOpen(true)}
            data-testid="insert-task-btn"
          >
            + Insert Task
          </button>
        ) : (
          <div className="space-y-1 p-1.5 border border-border/50 rounded" data-testid="insert-task-form">
            <input
              type="text"
              placeholder="Task subject"
              className="w-full text-[8px] bg-muted/45 border border-border/70 rounded px-1.5 py-0.5 text-foreground placeholder:text-muted-foreground/50"
              value={insertSubject}
              onChange={(e) => setInsertSubject(e.target.value)}
              data-testid="insert-subject"
            />
            <div className="flex gap-1">
              <select
                className="text-[7px] bg-muted/45 border border-border/70 rounded px-1 py-0.5 text-foreground"
                value={insertModel}
                onChange={(e) => setInsertModel(e.target.value)}
                data-testid="insert-model"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                className="flex-1 text-[7px] bg-muted/45 border border-border/70 rounded px-1 py-0.5 text-foreground"
                value={insertAfterTask}
                onChange={(e) => setInsertAfterTask(Number(e.target.value))}
                data-testid="insert-after"
              >
                <option value={0}>At beginning</option>
                {tasks.map((t) => (
                  <option key={t.taskNumber} value={t.taskNumber}>
                    After task {t.taskNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-1">
              <button
                className={controlBtnClass}
                onClick={handleInsert}
                disabled={!insertSubject.trim()}
                data-testid="insert-confirm"
              >
                Insert
              </button>
              <button
                className={controlBtnClass}
                onClick={() => {
                  setInsertFormOpen(false)
                  setInsertSubject("")
                }}
                data-testid="insert-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </StatPanel>
  )
}
```

2. Verify TypeScript compiles:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx tsc --noEmit --project tina-web/tsconfig.json`
Expected: No errors.

---

## Task 10: Add web tests for PendingTaskEditor

**Files:**
- `tina-web/src/components/__tests__/PendingTaskEditor.test.tsx` (new file)

**Model:** opus

**review:** full

**Depends on:** Task 9

### Steps

1. Create the test file:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PendingTaskEditor } from "../PendingTaskEditor"

const mockEnqueue = vi.fn()
const mockUseQuery = vi.fn()

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => mockEnqueue),
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
  }
})

const defaultTasks = [
  {
    _id: "t1",
    orchestrationId: "orch1",
    phaseNumber: "1",
    taskNumber: 1,
    subject: "First task",
    status: "completed",
    model: "opus",
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    _id: "t2",
    orchestrationId: "orch1",
    phaseNumber: "1",
    taskNumber: 2,
    subject: "Second task",
    status: "pending",
    model: "opus",
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    _id: "t3",
    orchestrationId: "orch1",
    phaseNumber: "1",
    taskNumber: 3,
    subject: "Third task",
    status: "pending",
    model: "haiku",
    revision: 1,
    insertedBy: "web-ui",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

function renderEditor(tasksOverride?: typeof defaultTasks | null) {
  if (tasksOverride === null) {
    mockUseQuery.mockReturnValue(null)
  } else {
    mockUseQuery.mockReturnValue(tasksOverride ?? defaultTasks)
  }
  return render(
    <PendingTaskEditor
      orchestrationId="orch1"
      nodeId="node1"
      featureName="test-feature"
      phaseNumber="1"
    />,
  )
}

describe("PendingTaskEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state when tasks are null", () => {
    renderEditor(null)
    expect(screen.getByText("Loading...")).toBeInTheDocument()
  })

  it("shows empty state when no tasks seeded", () => {
    renderEditor([])
    expect(screen.getByText(/no execution tasks seeded/i)).toBeInTheDocument()
  })

  it("renders all tasks with task numbers", () => {
    renderEditor()
    expect(screen.getByTestId("exec-task-1")).toBeInTheDocument()
    expect(screen.getByTestId("exec-task-2")).toBeInTheDocument()
    expect(screen.getByTestId("exec-task-3")).toBeInTheDocument()
  })

  it("shows model select only for pending tasks", () => {
    renderEditor()
    // Task 1 is completed - should show status text, not a select
    expect(screen.queryByTestId("task-model-1")).not.toBeInTheDocument()
    // Task 2 is pending - should show model select
    expect(screen.getByTestId("task-model-2")).toBeInTheDocument()
    // Task 3 is pending - should show model select
    expect(screen.getByTestId("task-model-3")).toBeInTheDocument()
  })

  it("displays current model values", () => {
    renderEditor()
    expect(screen.getByTestId("task-model-2")).toHaveValue("opus")
    expect(screen.getByTestId("task-model-3")).toHaveValue("haiku")
  })

  it("calls enqueueControlAction on model change", async () => {
    const user = userEvent.setup()
    renderEditor()
    mockEnqueue.mockResolvedValue("action-id")

    await user.selectOptions(screen.getByTestId("task-model-2"), "haiku")

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "task_set_model",
        requestedBy: "web-ui",
      }),
    )
    const callPayload = JSON.parse(mockEnqueue.mock.calls[0][0].payload)
    expect(callPayload.taskNumber).toBe(2)
    expect(callPayload.model).toBe("haiku")
    expect(callPayload.revision).toBe(1)
  })

  it("shows error on mutation failure", async () => {
    const user = userEvent.setup()
    renderEditor()
    mockEnqueue.mockRejectedValue(new Error("Task revision conflict"))

    await user.selectOptions(screen.getByTestId("task-model-2"), "haiku")

    expect(screen.getByRole("alert")).toHaveTextContent("Task revision conflict")
  })

  it("shows insert task button", () => {
    renderEditor()
    expect(screen.getByTestId("insert-task-btn")).toBeInTheDocument()
  })

  it("opens insert form on button click", async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByTestId("insert-task-btn"))

    expect(screen.getByTestId("insert-task-form")).toBeInTheDocument()
    expect(screen.getByTestId("insert-subject")).toBeInTheDocument()
    expect(screen.getByTestId("insert-model")).toBeInTheDocument()
  })

  it("inserts task with correct payload", async () => {
    const user = userEvent.setup()
    renderEditor()
    mockEnqueue.mockResolvedValue("action-id")

    await user.click(screen.getByTestId("insert-task-btn"))
    await user.type(screen.getByTestId("insert-subject"), "Remediation task")
    await user.selectOptions(screen.getByTestId("insert-model"), "opus")
    await user.click(screen.getByTestId("insert-confirm"))

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "task_insert",
      }),
    )
    const callPayload = JSON.parse(mockEnqueue.mock.calls[0][0].payload)
    expect(callPayload.subject).toBe("Remediation task")
    expect(callPayload.model).toBe("opus")
  })

  it("closes insert form on cancel", async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByTestId("insert-task-btn"))
    expect(screen.getByTestId("insert-task-form")).toBeInTheDocument()

    await user.click(screen.getByTestId("insert-cancel"))
    expect(screen.queryByTestId("insert-task-form")).not.toBeInTheDocument()
  })

  it("shows inserted task indicator", () => {
    renderEditor()
    // Task 3 has insertedBy set, should show "+" indicator
    const task3 = screen.getByTestId("exec-task-3")
    expect(task3.textContent).toContain("+")
  })

  it("displays editable count in header", () => {
    renderEditor()
    expect(screen.getByText(/3 tasks \(2 editable\)/)).toBeInTheDocument()
  })
})
```

2. Run the tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npx vitest run tina-web/src/components/__tests__/PendingTaskEditor.test.tsx`
Expected: All tests pass.

---

## Task 11: Integration test for task reconfiguration end-to-end flow

**Files:**
- `convex/controlPlane.test.ts`

**Model:** opus

**review:** full

**Depends on:** Task 4, Task 5

### Steps

1. Add integration tests that verify the full task reconfiguration flow:

```typescript
describe("controlPlane:taskReconfiguration:integration", () => {
  async function seedAndGetFixture(t: ReturnType<typeof convexTest>) {
    const { nodeId, orchestrationId } = await createFeatureFixture(t, "task-int");
    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Implement feature", model: "opus" },
        { taskNumber: 2, subject: "Write tests", model: "opus", dependsOn: [1] },
        { taskNumber: 3, subject: "Update docs", model: "haiku" },
      ],
    });
    return { nodeId, orchestrationId };
  }

  test("e2e: task_edit creates action log, modifies task, records event", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await seedAndGetFixture(t);

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({
        feature: "task-int",
        phaseNumber: "1",
        taskNumber: 2,
        revision: 1,
        subject: "Write comprehensive tests",
        model: "sonnet",
      }),
      requestedBy: "web:operator",
      idempotencyKey: "e2e-task-edit-001",
    });

    // 1. Action log
    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].actionType).toBe("task_edit");
    expect(actions[0].status).toBe("pending");

    // 2. Task modified
    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 2,
    });
    expect(task!.subject).toBe("Write comprehensive tests");
    expect(task!.model).toBe("sonnet");
    expect(task!.revision).toBe(2);

    // 3. Audit event
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("task_edit");
  });

  test("e2e: task_insert adds task and records audit trail", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await seedAndGetFixture(t);

    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_insert",
      payload: JSON.stringify({
        feature: "task-int",
        phaseNumber: "1",
        afterTask: 1,
        subject: "Add error handling",
        model: "opus",
        dependsOn: [1],
      }),
      requestedBy: "web:operator",
      idempotencyKey: "e2e-task-insert-001",
    });

    // Verify inserted task
    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(tasks).toHaveLength(4);
    const inserted = tasks.find((t) => t.subject === "Add error handling");
    expect(inserted).not.toBeNull();
    expect(inserted!.taskNumber).toBe(4);
    expect(inserted!.insertedBy).toBe("web:operator");

    // Verify audit trail
    const events = await t.query(api.events.listEvents, {
      orchestrationId,
      eventType: "control_action_requested",
    });
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("task_insert");
  });

  test("e2e: edit + insert + model override sequence with correct revisions", async () => {
    const t = convexTest(schema, modules);
    const { nodeId, orchestrationId } = await seedAndGetFixture(t);

    // 1. Edit task 1 subject (rev 1 -> 2)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_edit",
      payload: JSON.stringify({
        feature: "task-int",
        phaseNumber: "1",
        taskNumber: 1,
        revision: 1,
        subject: "Implement core feature",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "seq-task-1",
    });

    // 2. Insert new task
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_insert",
      payload: JSON.stringify({
        feature: "task-int",
        phaseNumber: "1",
        afterTask: 1,
        subject: "Add validation",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "seq-task-2",
    });

    // 3. Override model on task 3 (rev 1 -> 2)
    await t.mutation(api.controlPlane.enqueueControlAction, {
      orchestrationId,
      nodeId,
      actionType: "task_set_model",
      payload: JSON.stringify({
        feature: "task-int",
        phaseNumber: "1",
        taskNumber: 3,
        revision: 1,
        model: "opus",
      }),
      requestedBy: "web-ui",
      idempotencyKey: "seq-task-3",
    });

    // Verify final state
    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(tasks).toHaveLength(4);

    const task1 = tasks.find((t) => t.taskNumber === 1);
    expect(task1!.subject).toBe("Implement core feature");
    expect(task1!.revision).toBe(2);

    const task3 = tasks.find((t) => t.taskNumber === 3);
    expect(task3!.model).toBe("opus");
    expect(task3!.revision).toBe(2);

    const inserted = tasks.find((t) => t.taskNumber === 4);
    expect(inserted!.subject).toBe("Add validation");

    const actions = await t.query(api.controlPlane.listControlActions, {
      orchestrationId,
    });
    expect(actions).toHaveLength(3);
  });
});
```

2. Run all Convex tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/control-plane-v1 && npm test -- --run convex/controlPlane.test.ts`
Expected: All tests pass.

---

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 1200 |

---

## Phase Estimates

| Task | Estimated Minutes | Description |
|------|-------------------|-------------|
| Task 1 | 3 | Add executionTasks table to schema |
| Task 2 | 5 | Add executionTasks CRUD mutations/queries |
| Task 3 | 5 | Add task payload validation + mutation in controlPlane.ts |
| Task 4 | 5 | Convex tests for task reconfiguration validation |
| Task 5 | 4 | Convex tests for executionTasks CRUD |
| Task 6 | 5 | Daemon dispatch for task action types |
| Task 7 | 4 | Daemon tests for task dispatch |
| Task 8 | 5 | tina-session task reconfiguration commands |
| Task 9 | 5 | PendingTaskEditor web component |
| Task 10 | 5 | Web tests for PendingTaskEditor |
| Task 11 | 5 | Integration tests for e2e task reconfiguration |
| **Total** | **56** | |

---

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
