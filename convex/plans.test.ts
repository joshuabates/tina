import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

describe("plans:upsertPlan", () => {
  test("creates new plan record when none exists", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const planId = await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-1.md",
      content: "# Phase 1 Plan\n\nImplementation details...",
    });

    expect(planId).toBeTruthy();

    const plan = await t.query(api.plans.getPlan, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(plan).not.toBeNull();
    expect(plan!.planPath).toBe("docs/plans/2026-02-10-auth-feature-phase-1.md");
    expect(plan!.content).toBe("# Phase 1 Plan\n\nImplementation details...");
    expect(plan!.lastSynced).toBeTruthy();
  });

  test("updates existing plan content when called again for same orchestration+phase", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const id1 = await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-1.md",
      content: "# Original content",
    });

    const id2 = await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-1.md",
      content: "# Updated content",
    });

    expect(id2).toBe(id1);

    const plan = await t.query(api.plans.getPlan, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(plan!.content).toBe("# Updated content");
  });

  test("updates lastSynced timestamp on update", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-1.md",
      content: "# Original",
    });

    const plan1 = await t.query(api.plans.getPlan, {
      orchestrationId,
      phaseNumber: "1",
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-1.md",
      content: "# Updated",
    });

    const plan2 = await t.query(api.plans.getPlan, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(plan2!.lastSynced).not.toBe(plan1!.lastSynced);
  });

  test("updates planPath if it changes", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/old-path.md",
      content: "# Content",
    });

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/new-path.md",
      content: "# Content",
    });

    const plan = await t.query(api.plans.getPlan, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(plan!.planPath).toBe("docs/plans/new-path.md");
  });
});

describe("plans:getPlan", () => {
  test("returns correct plan for orchestration+phase", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-1.md",
      content: "# Phase 1 Plan",
    });

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "2",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-2.md",
      content: "# Phase 2 Plan",
    });

    const plan = await t.query(api.plans.getPlan, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(plan).not.toBeNull();
    expect(plan!.phaseNumber).toBe("1");
    expect(plan!.content).toBe("# Phase 1 Plan");
  });

  test("returns null when no plan exists", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "empty-feature");

    const plan = await t.query(api.plans.getPlan, {
      orchestrationId,
      phaseNumber: "99",
    });

    expect(plan).toBeNull();
  });
});

describe("plans:listPlans", () => {
  test("returns all plans for orchestration", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-1.md",
      content: "# Phase 1",
    });

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "2",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-2.md",
      content: "# Phase 2",
    });

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "3",
      planPath: "docs/plans/2026-02-10-auth-feature-phase-3.md",
      content: "# Phase 3",
    });

    const plans = await t.query(api.plans.listPlans, {
      orchestrationId,
    });

    expect(plans.length).toBe(3);
    const phaseNumbers = plans.map((p) => p.phaseNumber).sort();
    expect(phaseNumbers).toEqual(["1", "2", "3"]);
  });

  test("returns empty array for orchestration with no plans", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "empty-feature");

    const plans = await t.query(api.plans.listPlans, {
      orchestrationId,
    });

    expect(plans).toEqual([]);
  });
});
