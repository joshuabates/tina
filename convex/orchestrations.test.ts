import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
import { createNode, createProject } from "./test_helpers";

describe("orchestrations:upsertOrchestration", () => {
  test("accepts optional specId on insert", async () => {
    const t = convexTest(schema, modules);
    const nodeId = await createNode(t);
    const projectId = await createProject(t);

    const specId = await t.mutation(api.specs.createSpec, {
      projectId,
      title: "Test Spec",
      markdown: "# Test",
    });

    const orchestrationId = await t.mutation(
      api.orchestrations.upsertOrchestration,
      {
        nodeId,
        projectId,
        specId,
        featureName: "design-link-test",
        specDocPath: "/docs/design.md",
        branch: "tina/design-link-test",
        totalPhases: 2,
        currentPhase: 1,
        status: "planning",
        startedAt: "2026-02-11T00:00:00Z",
      },
    );

    const detail = await t.query(api.orchestrations.getOrchestrationDetail, {
      orchestrationId,
    });

    expect(detail).not.toBeNull();
    expect(detail!.specId).toBe(specId);
  });

  test("inserts without specId (field remains undefined)", async () => {
    const t = convexTest(schema, modules);
    const nodeId = await createNode(t);

    const orchestrationId = await t.mutation(
      api.orchestrations.upsertOrchestration,
      {
        nodeId,
        featureName: "no-design-test",
        specDocPath: "/docs/design.md",
        branch: "tina/no-design-test",
        totalPhases: 1,
        currentPhase: 1,
        status: "planning",
        startedAt: "2026-02-11T00:00:00Z",
      },
    );

    const detail = await t.query(api.orchestrations.getOrchestrationDetail, {
      orchestrationId,
    });

    expect(detail).not.toBeNull();
    expect(detail!.specId).toBeUndefined();
  });

  test("patches specId on upsert update", async () => {
    const t = convexTest(schema, modules);
    const nodeId = await createNode(t);
    const projectId = await createProject(t);

    // First insert without specId
    await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId,
      featureName: "design-patch-test",
      specDocPath: "/docs/design.md",
      branch: "tina/design-patch-test",
      totalPhases: 2,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-11T00:00:00Z",
    });

    const specId = await t.mutation(api.specs.createSpec, {
      projectId,
      title: "Patched Spec",
      markdown: "# Patched",
    });

    // Upsert again with specId
    const orchestrationId = await t.mutation(
      api.orchestrations.upsertOrchestration,
      {
        nodeId,
        specId,
        featureName: "design-patch-test",
        specDocPath: "/docs/design.md",
        branch: "tina/design-patch-test",
        totalPhases: 2,
        currentPhase: 1,
        status: "executing",
        startedAt: "2026-02-11T00:00:00Z",
      },
    );

    const detail = await t.query(api.orchestrations.getOrchestrationDetail, {
      orchestrationId,
    });

    expect(detail).not.toBeNull();
    expect(detail!.specId).toBe(specId);
  });

  test("does not overwrite specId when not provided on update", async () => {
    const t = convexTest(schema, modules);
    const nodeId = await createNode(t);
    const projectId = await createProject(t);

    const specId = await t.mutation(api.specs.createSpec, {
      projectId,
      title: "Keep Spec",
      markdown: "# Keep",
    });

    // Insert with specId
    await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId,
      specId,
      featureName: "design-keep-test",
      specDocPath: "/docs/design.md",
      branch: "tina/design-keep-test",
      totalPhases: 2,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-11T00:00:00Z",
    });

    // Upsert without specId — should preserve existing
    const orchestrationId = await t.mutation(
      api.orchestrations.upsertOrchestration,
      {
        nodeId,
        featureName: "design-keep-test",
        specDocPath: "/docs/design.md",
        branch: "tina/design-keep-test",
        totalPhases: 2,
        currentPhase: 2,
        status: "executing",
        startedAt: "2026-02-11T00:00:00Z",
      },
    );

    const detail = await t.query(api.orchestrations.getOrchestrationDetail, {
      orchestrationId,
    });

    expect(detail).not.toBeNull();
    expect(detail!.specId).toBe(specId);
  });
});
