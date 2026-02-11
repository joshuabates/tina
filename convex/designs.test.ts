import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createProject } from "./test_helpers";

describe("designs", () => {
  describe("createDesign", () => {
    test("creates design with correct key format and allocates next number", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "TINA",
        repoPath: "/Users/joshua/Projects/tina",
      });

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "API Design",
        markdown: "# REST API Specification",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design).toBeDefined();
      expect(design?.designKey).toBe("TINA-D1");
      expect(design?.title).toBe("API Design");
      expect(design?.markdown).toBe("# REST API Specification");
      expect(design?.status).toBe("draft");
      expect(design?.archivedAt).toBeUndefined();
    });

    test("allocates sequential keys for multiple designs", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "PROJ",
        repoPath: "/Users/joshua/Projects/proj",
      });

      const design1Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 1",
        markdown: "# Design One",
      });

      const design2Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 2",
        markdown: "# Design Two",
      });

      const design1 = await t.query(api.designs.getDesign, { designId: design1Id });
      const design2 = await t.query(api.designs.getDesign, { designId: design2Id });

      expect(design1?.designKey).toBe("PROJ-D1");
      expect(design2?.designKey).toBe("PROJ-D2");
    });

  });

  describe("getDesign", () => {
    test("returns null for non-existent design", async () => {
      const t = convexTest(schema);
      const fakeId = (await createProject(t)).replace("projects", "designs");

      const design = await t.query(api.designs.getDesign, { designId: fakeId as any });
      expect(design).toBeNull();
    });
  });

  describe("getDesignByKey", () => {
    test("looks up design by key", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "KEY",
        repoPath: "/Users/joshua/Projects/key",
      });

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Test design",
        markdown: "# Test",
      });

      const design = await t.query(api.designs.getDesignByKey, {
        designKey: "KEY-D1",
      });

      expect(design?._id).toBe(designId);
      expect(design?.designKey).toBe("KEY-D1");
    });

    test("returns null for non-existent key", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "NONE",
        repoPath: "/Users/joshua/Projects/none",
      });

      const design = await t.query(api.designs.getDesignByKey, {
        designKey: "NONE-D999",
      });

      expect(design).toBeNull();
    });
  });

  describe("listDesigns", () => {
    test("lists all designs for a project", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "LIST",
        repoPath: "/Users/joshua/Projects/list",
      });

      await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 1",
        markdown: "# Design One",
      });

      await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 2",
        markdown: "# Design Two",
      });

      const designs = await t.query(api.designs.listDesigns, { projectId });
      expect(designs).toHaveLength(2);
      expect(designs.map((d: any) => d.title)).toEqual(
        expect.arrayContaining(["Design 1", "Design 2"]),
      );
    });

    test("filters by status", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t, {
        name: "STAT",
        repoPath: "/Users/joshua/Projects/stat",
      });

      const design1Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Draft design",
        markdown: "# Draft",
      });

      const design2Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Approved design",
        markdown: "# Approved",
      });

      // Transition design2 to approved
      await t.mutation(api.designs.transitionDesign, {
        designId: design2Id,
        newStatus: "in_review",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId: design2Id,
        newStatus: "approved",
      });

      const draftDesigns = await t.query(api.designs.listDesigns, {
        projectId,
        status: "draft",
      });

      const approvedDesigns = await t.query(api.designs.listDesigns, {
        projectId,
        status: "approved",
      });

      expect(draftDesigns).toHaveLength(1);
      expect(draftDesigns[0]?.title).toBe("Draft design");

      expect(approvedDesigns).toHaveLength(1);
      expect(approvedDesigns[0]?.title).toBe("Approved design");
    });
  });

  describe("updateDesign", () => {
    test("updates title and markdown", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Original title",
        markdown: "# Original",
      });

      const beforeUpdate = await t.query(api.designs.getDesign, { designId });
      const beforeTime = beforeUpdate?.updatedAt;

      // Small delay to ensure updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      await t.mutation(api.designs.updateDesign, {
        designId,
        title: "Updated title",
        markdown: "# Updated",
      });

      const afterUpdate = await t.query(api.designs.getDesign, { designId });
      expect(afterUpdate?.title).toBe("Updated title");
      expect(afterUpdate?.markdown).toBe("# Updated");
      expect(afterUpdate?.updatedAt).not.toBe(beforeTime);
    });

    test("partial updates only modify specified fields", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Original",
        markdown: "# Original content",
      });

      await t.mutation(api.designs.updateDesign, {
        designId,
        title: "New title",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.title).toBe("New title");
      expect(design?.markdown).toBe("# Original content");
    });
  });

  describe("transitionDesign", () => {
    test("transitions draft -> in_review", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# Content",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "in_review",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.status).toBe("in_review");
    });

    test("transitions in_review -> approved", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# Content",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "in_review",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "approved",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.status).toBe("approved");
    });

    test("transitions in_review -> draft (reject)", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# Content",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "in_review",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "draft",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.status).toBe("draft");
    });

    test("transitions approved -> archived", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# Content",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "in_review",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "approved",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "archived",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.status).toBe("archived");
      expect(design?.archivedAt).toBeDefined();
    });

    test("transitions archived -> draft (unarchive)", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# Content",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "in_review",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "approved",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "archived",
      });

      const beforeUnarchive = await t.query(api.designs.getDesign, { designId });
      expect(beforeUnarchive?.archivedAt).toBeDefined();

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "draft",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.status).toBe("draft");
      expect(design?.archivedAt).toBeFalsy();
    });

    test("rejects invalid transitions", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# Content",
      });

      // draft can't transition to approved directly
      try {
        await t.mutation(api.designs.transitionDesign, {
          designId,
          newStatus: "approved",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Invalid status transition");
      }
    });

    test("design not found", async () => {
      const t = convexTest(schema);
      const projectId = await createProject(t);

      // Create and delete by using the test to get an ID that doesn't exist
      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        markdown: "# Content",
      });

      // Now manually create a fake ID format to test not found
      try {
        await t.mutation(api.designs.transitionDesign, {
          designId: designId.replace(/^[a-z0-9]+/, "z0000000000000000000000") as any,
          newStatus: "in_review",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Design not found");
      }
    });
  });
});
