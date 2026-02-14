import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
import { createProject } from "./test_helpers";

describe("projectCounters:allocateKey", () => {
  test("allocates key 1 on first call and seeds counter to 2", async () => {
    const t = convexTest(schema, modules);

    const projectId = await createProject(t, {
      name: "counter-test-project",
      repoPath: "/Users/joshua/Projects/counter-test",
    });

    const key = await t.mutation(internal.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "spec",
    });

    expect(key).toBe(1);

    // Verify the counter was seeded
    const counter = await t.query(internal.projectCounters.getCounter, {
      projectId,
      counterType: "spec",
    });
    expect(counter?.nextValue).toBe(2);
  });

  test("allocates key 2 on second call and increments counter", async () => {
    const t = convexTest(schema, modules);

    const projectId = await createProject(t, {
      name: "counter-test-project-2",
      repoPath: "/Users/joshua/Projects/counter-test-2",
    });

    const key1 = await t.mutation(internal.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "spec",
    });
    const key2 = await t.mutation(internal.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "spec",
    });

    expect(key1).toBe(1);
    expect(key2).toBe(2);

    const counter = await t.query(internal.projectCounters.getCounter, {
      projectId,
      counterType: "spec",
    });
    expect(counter?.nextValue).toBe(3);
  });

  test("maintains separate counters for different types", async () => {
    const t = convexTest(schema, modules);

    const projectId = await createProject(t, {
      name: "counter-test-project-3",
      repoPath: "/Users/joshua/Projects/counter-test-3",
    });

    const specKey1 = await t.mutation(internal.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "spec",
    });
    const ticketKey1 = await t.mutation(internal.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "ticket",
    });
    const specKey2 = await t.mutation(internal.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "spec",
    });

    expect(specKey1).toBe(1);
    expect(ticketKey1).toBe(1);
    expect(specKey2).toBe(2);

    const specCounter = await t.query(internal.projectCounters.getCounter, {
      projectId,
      counterType: "spec",
    });
    expect(specCounter?.nextValue).toBe(3);

    const ticketCounter = await t.query(internal.projectCounters.getCounter, {
      projectId,
      counterType: "ticket",
    });
    expect(ticketCounter?.nextValue).toBe(2);
  });

  test("maintains separate counters for different projects", async () => {
    const t = convexTest(schema, modules);

    const project1Id = await createProject(t, {
      name: "counter-test-project-4a",
      repoPath: "/Users/joshua/Projects/counter-test-4a",
    });
    const project2Id = await createProject(t, {
      name: "counter-test-project-4b",
      repoPath: "/Users/joshua/Projects/counter-test-4b",
    });

    const key1Project1 = await t.mutation(internal.projectCounters.allocateKeyMutation, {
      projectId: project1Id,
      counterType: "spec",
    });
    const key1Project2 = await t.mutation(internal.projectCounters.allocateKeyMutation, {
      projectId: project2Id,
      counterType: "spec",
    });

    expect(key1Project1).toBe(1);
    expect(key1Project2).toBe(1);
  });
});
