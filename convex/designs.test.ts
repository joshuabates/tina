import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createProject } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("designs", () => {
  describe("createDesign", () => {
    test("creates design with correct key format and status exploring", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "TINA",
        repoPath: "/Users/joshua/Projects/tina",
      });

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Login Flow",
        prompt: "How should the login flow work?",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design).toBeDefined();
      expect(design?.designKey).toBe("TINA-D1");
      expect(design?.title).toBe("Login Flow");
      expect(design?.prompt).toBe("How should the login flow work?");
      expect(design?.status).toBe("exploring");
      expect(design?.createdAt).toBeDefined();
      expect(design?.updatedAt).toBeDefined();
    });

    test("allocates sequential keys for multiple designs", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "PROJ",
        repoPath: "/Users/joshua/Projects/proj",
      });

      const design1Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 1",
        prompt: "Question 1",
      });

      const design2Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 2",
        prompt: "Question 2",
      });

      const design1 = await t.query(api.designs.getDesign, { designId: design1Id });
      const design2 = await t.query(api.designs.getDesign, { designId: design2Id });

      expect(design1?.designKey).toBe("PROJ-D1");
      expect(design2?.designKey).toBe("PROJ-D2");
    });

    test("throws when project not found", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      try {
        await t.mutation(api.designs.createDesign, {
          projectId: projectId.replace(/^[a-z0-9]+/, "z0000000000000000000000") as any,
          title: "Bad",
          prompt: "Bad",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Project not found");
      }
    });
  });

  describe("getDesign", () => {
    test("returns null for non-existent design", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const fakeId = projectId.replace("projects", "designs");

      const design = await t.query(api.designs.getDesign, { designId: fakeId as any });
      expect(design).toBeNull();
    });

    test("hides legacy spec-era rows", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "LEGACY",
        repoPath: "/Users/joshua/Projects/legacy",
      });
      const now = new Date().toISOString();

      const designId = await t.run(async (ctx) => {
        return await ctx.db.insert("designs", {
          projectId: projectId as any,
          designKey: "LEGACY-D1",
          title: "Legacy Design",
          markdown: "# Legacy design markdown",
          status: "draft",
          createdAt: now,
          updatedAt: now,
        });
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design).toBeNull();
    });
  });

  describe("getDesignByKey", () => {
    test("looks up design by key", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "KEY",
        repoPath: "/Users/joshua/Projects/key",
      });

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Test design",
        prompt: "Test question",
      });

      const design = await t.query(api.designs.getDesignByKey, {
        designKey: "KEY-D1",
      });

      expect(design?._id).toBe(designId);
      expect(design?.designKey).toBe("KEY-D1");
    });

    test("returns null for non-existent key", async () => {
      const t = convexTest(schema, modules);

      const design = await t.query(api.designs.getDesignByKey, {
        designKey: "NONE-D999",
      });

      expect(design).toBeNull();
    });
  });

  describe("listDesigns", () => {
    test("lists all designs for a project", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "LIST",
        repoPath: "/Users/joshua/Projects/list",
      });

      await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 1",
        prompt: "Question 1",
      });

      await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design 2",
        prompt: "Question 2",
      });

      const designs = await t.query(api.designs.listDesigns, { projectId });
      expect(designs).toHaveLength(2);
      expect(designs.map((d: any) => d.title)).toEqual(
        expect.arrayContaining(["Design 1", "Design 2"]),
      );
    });

    test("filters by status", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "STAT",
        repoPath: "/Users/joshua/Projects/stat",
      });

      await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Exploring design",
        prompt: "Question 1",
      });

      const design2Id = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Archived design",
        prompt: "Question 2",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId: design2Id,
        newStatus: "archived",
      });

      const exploring = await t.query(api.designs.listDesigns, {
        projectId,
        status: "exploring",
      });

      const archived = await t.query(api.designs.listDesigns, {
        projectId,
        status: "archived",
      });

      expect(exploring).toHaveLength(1);
      expect(exploring[0]?.title).toBe("Exploring design");

      expect(archived).toHaveLength(1);
      expect(archived[0]?.title).toBe("Archived design");
    });

    test("excludes legacy rows from list query", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t, {
        name: "LEGACY",
        repoPath: "/Users/joshua/Projects/legacy",
      });
      const now = new Date().toISOString();

      await t.run(async (ctx) => {
        return await ctx.db.insert("designs", {
          projectId: projectId as any,
          designKey: "LEGACY-D1",
          title: "Legacy Design",
          markdown: "# Legacy design markdown",
          status: "draft",
          createdAt: now,
          updatedAt: now,
        });
      });

      const designs = await t.query(api.designs.listDesigns, { projectId });
      expect(designs).toEqual([]);
    });
  });

  describe("updateDesign", () => {
    test("updates title and prompt", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Original title",
        prompt: "Original question",
      });

      const beforeUpdate = await t.query(api.designs.getDesign, { designId });
      const beforeTime = beforeUpdate?.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await t.mutation(api.designs.updateDesign, {
        designId,
        title: "Updated title",
        prompt: "Updated question",
      });

      const afterUpdate = await t.query(api.designs.getDesign, { designId });
      expect(afterUpdate?.title).toBe("Updated title");
      expect(afterUpdate?.prompt).toBe("Updated question");
      expect(afterUpdate?.updatedAt).not.toBe(beforeTime);
    });

    test("partial updates only modify specified fields", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Original",
        prompt: "Original question",
      });

      await t.mutation(api.designs.updateDesign, {
        designId,
        title: "New title",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.title).toBe("New title");
      expect(design?.prompt).toBe("Original question");
    });

    test("throws for non-existent design", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Temp",
        prompt: "Temp",
      });

      try {
        await t.mutation(api.designs.updateDesign, {
          designId: designId.replace(/^[a-z0-9]+/, "z0000000000000000000000") as any,
          title: "Bad",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Design not found");
      }
    });
  });

  describe("transitionDesign", () => {
    test("transitions exploring -> archived", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        prompt: "Question",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "archived",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.status).toBe("archived");
    });

    test("transitions archived -> exploring", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        prompt: "Question",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "archived",
      });

      await t.mutation(api.designs.transitionDesign, {
        designId,
        newStatus: "exploring",
      });

      const design = await t.query(api.designs.getDesign, { designId });
      expect(design?.status).toBe("exploring");
    });

    test("rejects invalid transitions", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        prompt: "Question",
      });

      // locked status is no longer supported
      try {
        await t.mutation(api.designs.transitionDesign, {
          designId,
          newStatus: "locked",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Invalid status transition");
      }
    });

    test("throws for non-existent design", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);

      const designId = await t.mutation(api.designs.createDesign, {
        projectId,
        title: "Design",
        prompt: "Question",
      });

      try {
        await t.mutation(api.designs.transitionDesign, {
          designId: designId.replace(/^[a-z0-9]+/, "z0000000000000000000000") as any,
          newStatus: "archived",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Design not found");
      }
    });
  });
});
