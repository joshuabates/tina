import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

describe("featureFlags:getFlag", () => {
  test("returns false for non-existent flag", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.featureFlags.getFlag, {
      key: "cp.nonexistent",
    });
    expect(result).toBe(false);
  });

  test("returns true for enabled flag", async () => {
    const t = convexTest(schema);
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.launch_from_web",
      enabled: true,
    });
    const result = await t.query(api.featureFlags.getFlag, {
      key: "cp.launch_from_web",
    });
    expect(result).toBe(true);
  });

  test("returns false for disabled flag", async () => {
    const t = convexTest(schema);
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.launch_from_web",
      enabled: false,
    });
    const result = await t.query(api.featureFlags.getFlag, {
      key: "cp.launch_from_web",
    });
    expect(result).toBe(false);
  });
});

describe("featureFlags:setFlag", () => {
  test("creates a new flag", async () => {
    const t = convexTest(schema);
    const id = await t.mutation(api.featureFlags.setFlag, {
      key: "cp.runtime_controls",
      enabled: true,
      description: "Enable runtime controls",
    });
    expect(id).toBeDefined();

    const result = await t.query(api.featureFlags.getFlag, {
      key: "cp.runtime_controls",
    });
    expect(result).toBe(true);
  });

  test("updates an existing flag (upsert)", async () => {
    const t = convexTest(schema);
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.task_reconfiguration",
      enabled: true,
    });

    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.task_reconfiguration",
      enabled: false,
    });

    const result = await t.query(api.featureFlags.getFlag, {
      key: "cp.task_reconfiguration",
    });
    expect(result).toBe(false);
  });

  test("updates description on existing flag", async () => {
    const t = convexTest(schema);
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.runtime_controls",
      enabled: true,
      description: "Original description",
    });

    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.runtime_controls",
      enabled: true,
      description: "Updated description",
    });

    const flags = await t.query(api.featureFlags.listFlags, {});
    const flag = flags.find((f: { key: string }) => f.key === "cp.runtime_controls");
    expect(flag?.description).toBe("Updated description");
  });

  test("returns existing document id on update", async () => {
    const t = convexTest(schema);
    const id1 = await t.mutation(api.featureFlags.setFlag, {
      key: "cp.policy_reconfiguration",
      enabled: true,
    });
    const id2 = await t.mutation(api.featureFlags.setFlag, {
      key: "cp.policy_reconfiguration",
      enabled: false,
    });
    expect(id1).toBe(id2);
  });
});

describe("featureFlags:listFlags", () => {
  test("returns empty array when no flags exist", async () => {
    const t = convexTest(schema);
    const result = await t.query(api.featureFlags.listFlags, {});
    expect(result).toEqual([]);
  });

  test("returns all flags", async () => {
    const t = convexTest(schema);
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.launch_from_web",
      enabled: true,
    });
    await t.mutation(api.featureFlags.setFlag, {
      key: "cp.runtime_controls",
      enabled: false,
      description: "Runtime controls",
    });

    const result = await t.query(api.featureFlags.listFlags, {});
    expect(result).toHaveLength(2);

    const keys = result.map((f: { key: string }) => f.key).sort();
    expect(keys).toEqual(["cp.launch_from_web", "cp.runtime_controls"]);
  });
});
