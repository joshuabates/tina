import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

describe("executionTasks:seedExecutionTasks", () => {
  test("creates tasks with correct fields and returns ids", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "seed-feature");

    const ids = await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "Set up database" },
        {
          taskNumber: 2,
          subject: "Add API endpoints",
          description: "REST endpoints for CRUD",
          model: "opus",
          dependsOn: [1],
        },
      ],
    });

    expect(ids).toHaveLength(2);

    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(tasks).toHaveLength(2);

    const task1 = tasks.find((t) => t.taskNumber === 1)!;
    expect(task1.subject).toBe("Set up database");
    expect(task1.status).toBe("pending");
    expect(task1.revision).toBe(1);
    expect(task1.description).toBeUndefined();
    expect(task1.model).toBeUndefined();
    expect(task1.dependsOn).toBeUndefined();
    expect(task1.createdAt).toBeTypeOf("number");
    expect(task1.updatedAt).toBeTypeOf("number");

    const task2 = tasks.find((t) => t.taskNumber === 2)!;
    expect(task2.subject).toBe("Add API endpoints");
    expect(task2.description).toBe("REST endpoints for CRUD");
    expect(task2.model).toBe("opus");
    expect(task2.dependsOn).toEqual([1]);
  });

  test("throws when tasks already seeded for phase", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "dup-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "First task" }],
    });

    await expect(
      t.mutation(api.executionTasks.seedExecutionTasks, {
        orchestrationId,
        phaseNumber: "1",
        tasks: [{ taskNumber: 2, subject: "Second attempt" }],
      }),
    ).rejects.toThrow("Execution tasks already seeded for phase 1");
  });

  test("allows seeding different phases independently", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(
      t,
      "multi-phase-feature",
    );

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Phase 1 task" }],
    });

    const ids = await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "2",
      tasks: [{ taskNumber: 1, subject: "Phase 2 task" }],
    });

    expect(ids).toHaveLength(1);
  });
});

describe("executionTasks:listExecutionTasks", () => {
  test("returns all tasks for orchestration when no phase filter", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "list-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Phase 1 task" }],
    });

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "2",
      tasks: [
        { taskNumber: 1, subject: "Phase 2 task A" },
        { taskNumber: 2, subject: "Phase 2 task B" },
      ],
    });

    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
    });

    expect(tasks).toHaveLength(3);
  });

  test("returns only phase-specific tasks when phaseNumber provided", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(
      t,
      "filter-feature",
    );

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [{ taskNumber: 1, subject: "Phase 1 task" }],
    });

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "2",
      tasks: [{ taskNumber: 1, subject: "Phase 2 task" }],
    });

    const phase1Tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(phase1Tasks).toHaveLength(1);
    expect(phase1Tasks[0].subject).toBe("Phase 1 task");
  });

  test("returns empty array when no tasks exist", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(
      t,
      "empty-feature",
    );

    const tasks = await t.query(api.executionTasks.listExecutionTasks, {
      orchestrationId,
    });

    expect(tasks).toEqual([]);
  });
});

describe("executionTasks:getExecutionTask", () => {
  test("returns specific task by orchestration, phase, and task number", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "get-feature");

    await t.mutation(api.executionTasks.seedExecutionTasks, {
      orchestrationId,
      phaseNumber: "1",
      tasks: [
        { taskNumber: 1, subject: "First task" },
        { taskNumber: 2, subject: "Second task" },
      ],
    });

    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 2,
    });

    expect(task).not.toBeNull();
    expect(task!.subject).toBe("Second task");
    expect(task!.taskNumber).toBe(2);
  });

  test("returns null for non-existent task", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(
      t,
      "missing-feature",
    );

    const task = await t.query(api.executionTasks.getExecutionTask, {
      orchestrationId,
      phaseNumber: "1",
      taskNumber: 99,
    });

    expect(task).toBeNull();
  });
});
