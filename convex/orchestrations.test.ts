import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createNode, createProject } from "./test_helpers";

describe("orchestrations:upsertOrchestration", () => {
  test("accepts optional designId on insert", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const projectId = await createProject(t);

    const designId = await t.mutation(api.designs.createDesign, {
      projectId,
      title: "Test Design",
      markdown: "# Test",
    });

    const orchestrationId = await t.mutation(
      api.orchestrations.upsertOrchestration,
      {
        nodeId,
        projectId,
        designId,
        featureName: "design-link-test",
        designDocPath: "/docs/design.md",
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
    expect(detail!.designId).toBe(designId);
  });

  test("inserts without designId (field remains undefined)", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);

    const orchestrationId = await t.mutation(
      api.orchestrations.upsertOrchestration,
      {
        nodeId,
        featureName: "no-design-test",
        designDocPath: "/docs/design.md",
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
    expect(detail!.designId).toBeUndefined();
  });

  test("patches designId on upsert update", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const projectId = await createProject(t);

    // First insert without designId
    await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId,
      featureName: "design-patch-test",
      designDocPath: "/docs/design.md",
      branch: "tina/design-patch-test",
      totalPhases: 2,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-11T00:00:00Z",
    });

    const designId = await t.mutation(api.designs.createDesign, {
      projectId,
      title: "Patched Design",
      markdown: "# Patched",
    });

    // Upsert again with designId
    const orchestrationId = await t.mutation(
      api.orchestrations.upsertOrchestration,
      {
        nodeId,
        designId,
        featureName: "design-patch-test",
        designDocPath: "/docs/design.md",
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
    expect(detail!.designId).toBe(designId);
  });

  test("does not overwrite designId when not provided on update", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const projectId = await createProject(t);

    const designId = await t.mutation(api.designs.createDesign, {
      projectId,
      title: "Keep Design",
      markdown: "# Keep",
    });

    // Insert with designId
    await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId,
      designId,
      featureName: "design-keep-test",
      designDocPath: "/docs/design.md",
      branch: "tina/design-keep-test",
      totalPhases: 2,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-11T00:00:00Z",
    });

    // Upsert without designId — should preserve existing
    const orchestrationId = await t.mutation(
      api.orchestrations.upsertOrchestration,
      {
        nodeId,
        featureName: "design-keep-test",
        designDocPath: "/docs/design.md",
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
    expect(detail!.designId).toBe(designId);
  });
});
