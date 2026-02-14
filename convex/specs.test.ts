import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { COMPLEXITY_PRESETS } from "./specPresets";
import { createProject } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("specs", () => {
  describe("createSpec", () => {
    test("creates spec with correct key format and allocates next number", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "TINA",
        repoPath: "/Users/joshua/Projects/tina",
      });

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "API Spec",
        markdown: "# REST API Specification",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec).toBeDefined();
      expect(spec?.specKey).toBe("TINA-S1");
      expect(spec?.title).toBe("API Spec");
      expect(spec?.markdown).toBe("# REST API Specification");
      expect(spec?.status).toBe("draft");
      expect(spec?.archivedAt).toBeUndefined();
    });

    test("creates spec with complexity preset and seeds validation fields", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "PRESET",
        repoPath: "/Users/joshua/Projects/preset",
      });

      const markdown = "# Feature\n\n## Phase 1: Setup\n\n## Phase 2: Build";
      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Preset Spec",
        markdown,
        complexityPreset: "standard",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec).toBeDefined();
      expect(spec?.complexityPreset).toBe("standard");
      expect(spec?.requiredMarkers).toEqual(COMPLEXITY_PRESETS.standard);
      expect(spec?.completedMarkers).toEqual([]);
      expect(spec?.phaseCount).toBe(2);
      expect(spec?.phaseStructureValid).toBe(true);
      expect(spec?.validationUpdatedAt).toBeDefined();
    });

    test("creates spec without preset leaves validation fields unset", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "NOPRE",
        repoPath: "/Users/joshua/Projects/nopre",
      });

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "No Preset",
        markdown: "# Simple doc",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.complexityPreset).toBeUndefined();
      expect(spec?.requiredMarkers).toBeUndefined();
      expect(spec?.completedMarkers).toBeUndefined();
      expect(spec?.phaseCount).toBeUndefined();
      expect(spec?.phaseStructureValid).toBeUndefined();
      expect(spec?.validationUpdatedAt).toBeUndefined();
    });

    test("creates spec with preset and no phase headings shows invalid structure", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "NOPH",
        repoPath: "/Users/joshua/Projects/noph",
      });

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "No Phases",
        markdown: "# Design with no phases",
        complexityPreset: "simple",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.complexityPreset).toBe("simple");
      expect(spec?.requiredMarkers).toEqual(COMPLEXITY_PRESETS.simple);
      expect(spec?.phaseCount).toBe(0);
      expect(spec?.phaseStructureValid).toBe(false);
    });

    test("allocates sequential keys for multiple specs", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "PROJ",
        repoPath: "/Users/joshua/Projects/proj",
      });

      const spec1Id = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec 1",
        markdown: "# Design One",
      });

      const spec2Id = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec 2",
        markdown: "# Design Two",
      });

      const spec1 = await t.query(api.specs.getSpec, { specId: spec1Id });
      const spec2 = await t.query(api.specs.getSpec, { specId: spec2Id });

      expect(spec1?.specKey).toBe("PROJ-S1");
      expect(spec2?.specKey).toBe("PROJ-S2");
    });

  });

  describe("getSpec", () => {
    test("returns null for non-existent spec", async () => {
      const t = convexTest(schema, modules);
      const fakeId = (await createProject(t)).replace("projects", "specs");

      const spec = await t.query(api.specs.getSpec, { specId: fakeId as any });
      expect(spec).toBeNull();
    });
  });

  describe("getSpecByKey", () => {
    test("looks up spec by key", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "KEY",
        repoPath: "/Users/joshua/Projects/key",
      });

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Test spec",
        markdown: "# Test",
      });

      const spec = await t.query(api.specs.getSpecByKey, {
        specKey: "KEY-S1",
      });

      expect(spec?._id).toBe(specId);
      expect(spec?.specKey).toBe("KEY-S1");
    });

    test("returns null for non-existent key", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "NONE",
        repoPath: "/Users/joshua/Projects/none",
      });

      const spec = await t.query(api.specs.getSpecByKey, {
        specKey: "NONE-S999",
      });

      expect(spec).toBeNull();
    });
  });

  describe("listSpecs", () => {
    test("lists all specs for a project", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "LIST",
        repoPath: "/Users/joshua/Projects/list",
      });

      await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec 1",
        markdown: "# Design One",
      });

      await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec 2",
        markdown: "# Design Two",
      });

      const specs = await t.query(api.specs.listSpecs, { projectId });
      expect(specs).toHaveLength(2);
      expect(specs.map((d: any) => d.title)).toEqual(
        expect.arrayContaining(["Spec 1", "Spec 2"]),
      );
    });

    test("filters by status", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "STAT",
        repoPath: "/Users/joshua/Projects/stat",
      });

      const spec1Id = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Draft spec",
        markdown: "# Draft",
      });

      const spec2Id = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Approved spec",
        markdown: "# Approved",
      });

      // Transition spec2 to approved
      await t.mutation(api.specs.transitionSpec, {
        specId: spec2Id,
        newStatus: "in_review",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId: spec2Id,
        newStatus: "approved",
      });

      const draftSpecs = await t.query(api.specs.listSpecs, {
        projectId,
        status: "draft",
      });

      const approvedSpecs = await t.query(api.specs.listSpecs, {
        projectId,
        status: "approved",
      });

      expect(draftSpecs).toHaveLength(1);
      expect(draftSpecs[0]?.title).toBe("Draft spec");

      expect(approvedSpecs).toHaveLength(1);
      expect(approvedSpecs[0]?.title).toBe("Approved spec");
    });
  });

  describe("updateSpec", () => {
    test("updates title and markdown", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Original title",
        markdown: "# Original",
      });

      const beforeUpdate = await t.query(api.specs.getSpec, { specId });
      const beforeTime = beforeUpdate?.updatedAt;

      // Small delay to ensure updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await t.mutation(api.specs.updateSpec, {
        specId,
        title: "Updated title",
        markdown: "# Updated",
      });

      const afterUpdate = await t.query(api.specs.getSpec, { specId });
      expect(afterUpdate?.title).toBe("Updated title");
      expect(afterUpdate?.markdown).toBe("# Updated");
      expect(afterUpdate?.updatedAt).not.toBe(beforeTime);
    });

    test("recomputes phase validation when markdown changes", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Phase Test",
        markdown: "# Design\n\n## Phase 1: Setup",
        complexityPreset: "standard",
      });

      const before = await t.query(api.specs.getSpec, { specId });
      expect(before?.phaseCount).toBe(1);
      expect(before?.phaseStructureValid).toBe(true);

      await t.mutation(api.specs.updateSpec, {
        specId,
        markdown: "# Design\n\n## Phase 1: Setup\n\n## Phase 2: Build\n\n## Phase 3: Test",
      });

      const after = await t.query(api.specs.getSpec, { specId });
      expect(after?.phaseCount).toBe(3);
      expect(after?.phaseStructureValid).toBe(true);
      expect(after?.validationUpdatedAt).toBeDefined();
    });

    test("recomputes phase validation even without preset", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "No Preset",
        markdown: "# Original",
      });

      await t.mutation(api.specs.updateSpec, {
        specId,
        markdown: "# Updated\n\n## Phase 1: New phase",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.phaseCount).toBe(1);
      expect(spec?.phaseStructureValid).toBe(true);
      expect(spec?.validationUpdatedAt).toBeDefined();
    });

    test("title-only update does not touch phase validation", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Original",
        markdown: "# Original",
      });

      await t.mutation(api.specs.updateSpec, {
        specId,
        title: "New Title",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.phaseCount).toBeUndefined();
      expect(spec?.phaseStructureValid).toBeUndefined();
      expect(spec?.validationUpdatedAt).toBeUndefined();
    });

    test("partial updates only modify specified fields", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Original",
        markdown: "# Original content",
      });

      await t.mutation(api.specs.updateSpec, {
        specId,
        title: "New title",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.title).toBe("New title");
      expect(spec?.markdown).toBe("# Original content");
    });
  });

  describe("transitionSpec", () => {
    test("transitions draft -> in_review", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec",
        markdown: "# Content",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "in_review",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.status).toBe("in_review");
    });

    test("transitions in_review -> approved", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec",
        markdown: "# Content",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "in_review",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "approved",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.status).toBe("approved");
    });

    test("transitions in_review -> draft (reject)", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec",
        markdown: "# Content",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "in_review",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "draft",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.status).toBe("draft");
    });

    test("transitions approved -> archived", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec",
        markdown: "# Content",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "in_review",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "approved",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "archived",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.status).toBe("archived");
      expect(spec?.archivedAt).toBeDefined();
    });

    test("transitions archived -> draft (unarchive)", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec",
        markdown: "# Content",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "in_review",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "approved",
      });

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "archived",
      });

      const beforeUnarchive = await t.query(api.specs.getSpec, { specId });
      expect(beforeUnarchive?.archivedAt).toBeDefined();

      await t.mutation(api.specs.transitionSpec, {
        specId,
        newStatus: "draft",
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.status).toBe("draft");
      expect(spec?.archivedAt).toBeFalsy();
    });

    test("rejects invalid transitions", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec",
        markdown: "# Content",
      });

      // draft can't transition to approved directly
      try {
        await t.mutation(api.specs.transitionSpec, {
          specId,
          newStatus: "approved",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Invalid status transition");
      }
    });

    test("spec not found", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      // Create and delete by using the test to get an ID that doesn't exist
      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec",
        markdown: "# Content",
      });

      // Now manually create a fake ID format to test not found
      try {
        await t.mutation(api.specs.transitionSpec, {
          specId: specId.replace(/^[a-z0-9]+/, "z0000000000000000000000") as any,
          newStatus: "in_review",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Spec not found");
      }
    });
  });

  describe("updateSpecMarkers", () => {
    test("sets completedMarkers and validationUpdatedAt", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Spec with markers",
        markdown: "# Markers test",
      });

      const beforeUpdate = await t.query(api.specs.getSpec, { specId });
      expect(beforeUpdate?.completedMarkers).toBeUndefined();
      expect(beforeUpdate?.validationUpdatedAt).toBeUndefined();

      await t.mutation(api.specs.updateSpecMarkers, {
        specId,
        completedMarkers: ["success_criteria", "phase_structure"],
      });

      const afterUpdate = await t.query(api.specs.getSpec, { specId });
      expect(afterUpdate?.completedMarkers).toEqual(["success_criteria", "phase_structure"]);
      expect(afterUpdate?.validationUpdatedAt).toBeDefined();
      expect(afterUpdate?.updatedAt).toBeDefined();
    });

    test("replaces existing markers with new array", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Replace markers",
        markdown: "# Replace test",
      });

      await t.mutation(api.specs.updateSpecMarkers, {
        specId,
        completedMarkers: ["success_criteria", "phase_structure"],
      });

      await t.mutation(api.specs.updateSpecMarkers, {
        specId,
        completedMarkers: ["success_criteria"],
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.completedMarkers).toEqual(["success_criteria"]);
    });

    test("accepts empty markers array", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Empty markers",
        markdown: "# Empty test",
      });

      await t.mutation(api.specs.updateSpecMarkers, {
        specId,
        completedMarkers: [],
      });

      const spec = await t.query(api.specs.getSpec, { specId });
      expect(spec?.completedMarkers).toEqual([]);
    });

    test("throws for non-existent spec", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const specId = await t.mutation(api.specs.createSpec, {
        projectId,
        title: "Temp",
        markdown: "# Temp",
      });

      try {
        await t.mutation(api.specs.updateSpecMarkers, {
          specId: specId.replace(/^[a-z0-9]+/, "z0000000000000000000000") as any,
          completedMarkers: ["test"],
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Spec not found");
      }
    });
  });
});
