import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("projectCounters:allocateKey", () => {
  test("allocates key 1 on first call and seeds counter to 2", async () => {
    const t = convexTest(schema);

    const projectId = await t.mutation(api.projects.createProject, {
      name: "counter-test-project",
      repoPath: "/Users/joshua/Projects/counter-test",
    });

    const key = await t.mutation(api.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "design",
    });

    expect(key).toBe(1);

    // Verify the counter was seeded
    const counter = await t.query(api.projectCounters.getCounter, {
      projectId,
      counterType: "design",
    });
    expect(counter?.nextValue).toBe(2);
  });

  test("allocates key 2 on second call and increments counter", async () => {
    const t = convexTest(schema);

    const projectId = await t.mutation(api.projects.createProject, {
      name: "counter-test-project-2",
      repoPath: "/Users/joshua/Projects/counter-test-2",
    });

    const key1 = await t.mutation(api.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "design",
    });
    const key2 = await t.mutation(api.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "design",
    });

    expect(key1).toBe(1);
    expect(key2).toBe(2);

    const counter = await t.query(api.projectCounters.getCounter, {
      projectId,
      counterType: "design",
    });
    expect(counter?.nextValue).toBe(3);
  });

  test("maintains separate counters for different types", async () => {
    const t = convexTest(schema);

    const projectId = await t.mutation(api.projects.createProject, {
      name: "counter-test-project-3",
      repoPath: "/Users/joshua/Projects/counter-test-3",
    });

    const designKey1 = await t.mutation(api.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "design",
    });
    const ticketKey1 = await t.mutation(api.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "ticket",
    });
    const designKey2 = await t.mutation(api.projectCounters.allocateKeyMutation, {
      projectId,
      counterType: "design",
    });

    expect(designKey1).toBe(1);
    expect(ticketKey1).toBe(1);
    expect(designKey2).toBe(2);

    const designCounter = await t.query(api.projectCounters.getCounter, {
      projectId,
      counterType: "design",
    });
    expect(designCounter?.nextValue).toBe(3);

    const ticketCounter = await t.query(api.projectCounters.getCounter, {
      projectId,
      counterType: "ticket",
    });
    expect(ticketCounter?.nextValue).toBe(2);
  });

  test("maintains separate counters for different projects", async () => {
    const t = convexTest(schema);

    const project1Id = await t.mutation(api.projects.createProject, {
      name: "counter-test-project-4a",
      repoPath: "/Users/joshua/Projects/counter-test-4a",
    });
    const project2Id = await t.mutation(api.projects.createProject, {
      name: "counter-test-project-4b",
      repoPath: "/Users/joshua/Projects/counter-test-4b",
    });

    const key1Project1 = await t.mutation(api.projectCounters.allocateKeyMutation, {
      projectId: project1Id,
      counterType: "design",
    });
    const key1Project2 = await t.mutation(api.projectCounters.allocateKeyMutation, {
      projectId: project2Id,
      counterType: "design",
    });

    expect(key1Project1).toBe(1);
    expect(key1Project2).toBe(1);
  });
});
