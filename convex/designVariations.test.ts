import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createProject } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

async function createDesign(t: ReturnType<typeof convexTest>) {
  const projectId = await createProject(t);
  const now = new Date().toISOString();
  const designId = await t.run(async (ctx) => {
    return await ctx.db.insert("designs", {
      projectId: projectId as any,
      designKey: "TINA-D1",
      title: "Test Design",
      prompt: "What should the UI look like?",
      status: "exploring",
      createdAt: now,
      updatedAt: now,
    });
  });
  return designId;
}

describe("designVariations", () => {
  describe("createVariation", () => {
    test("creates variation with exploring status", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Option A",
        },
      );

      const variation = await t.query(api.designVariations.getVariation, {
        variationId,
      });
      expect(variation).toBeDefined();
      expect(variation?.slug).toBe("option-a");
      expect(variation?.title).toBe("Option A");
      expect(variation?.status).toBe("exploring");
      expect(variation?.designId).toBe(designId);
      expect(variation?.createdAt).toBeDefined();
      expect(variation?.updatedAt).toBeDefined();
    });

    test("throws when design does not exist", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);
      const fakeDesignId = designId.replace(
        /^[a-z0-9]+/,
        "z0000000000000000000000",
      );

      try {
        await t.mutation(api.designVariations.createVariation, {
          designId: fakeDesignId as any,
          slug: "option-a",
          title: "Option A",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Design not found");
      }
    });
  });

  describe("getVariation", () => {
    test("returns null for non-existent variation", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);
      const fakeId = designId.replace("designs", "designVariations");

      const variation = await t.query(api.designVariations.getVariation, {
        variationId: fakeId as any,
      });
      expect(variation).toBeNull();
    });
  });

  describe("listVariations", () => {
    test("lists all variations for a design", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      await t.mutation(api.designVariations.createVariation, {
        designId: designId as any,
        slug: "option-a",
        title: "Option A",
      });
      await t.mutation(api.designVariations.createVariation, {
        designId: designId as any,
        slug: "option-b",
        title: "Option B",
      });

      const variations = await t.query(api.designVariations.listVariations, {
        designId: designId as any,
      });
      expect(variations).toHaveLength(2);
      expect(variations.map((v: any) => v.title)).toEqual(
        expect.arrayContaining(["Option A", "Option B"]),
      );
    });

    test("filters by status", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const v1 = await t.mutation(api.designVariations.createVariation, {
        designId: designId as any,
        slug: "option-a",
        title: "Option A",
      });
      await t.mutation(api.designVariations.createVariation, {
        designId: designId as any,
        slug: "option-b",
        title: "Option B",
      });

      // Transition v1 to selected
      await t.mutation(api.designVariations.transitionVariation, {
        variationId: v1,
        newStatus: "selected",
      });

      const exploring = await t.query(api.designVariations.listVariations, {
        designId: designId as any,
        status: "exploring",
      });
      expect(exploring).toHaveLength(1);
      expect(exploring[0]?.title).toBe("Option B");

      const selected = await t.query(api.designVariations.listVariations, {
        designId: designId as any,
        status: "selected",
      });
      expect(selected).toHaveLength(1);
      expect(selected[0]?.title).toBe("Option A");
    });
  });

  describe("transitionVariation", () => {
    test("transitions exploring -> selected", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Option A",
        },
      );

      await t.mutation(api.designVariations.transitionVariation, {
        variationId,
        newStatus: "selected",
      });

      const variation = await t.query(api.designVariations.getVariation, {
        variationId,
      });
      expect(variation?.status).toBe("selected");
    });

    test("transitions exploring -> rejected", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Option A",
        },
      );

      await t.mutation(api.designVariations.transitionVariation, {
        variationId,
        newStatus: "rejected",
      });

      const variation = await t.query(api.designVariations.getVariation, {
        variationId,
      });
      expect(variation?.status).toBe("rejected");
    });

    test("transitions selected -> exploring", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Option A",
        },
      );

      await t.mutation(api.designVariations.transitionVariation, {
        variationId,
        newStatus: "selected",
      });
      await t.mutation(api.designVariations.transitionVariation, {
        variationId,
        newStatus: "exploring",
      });

      const variation = await t.query(api.designVariations.getVariation, {
        variationId,
      });
      expect(variation?.status).toBe("exploring");
    });

    test("transitions rejected -> exploring", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Option A",
        },
      );

      await t.mutation(api.designVariations.transitionVariation, {
        variationId,
        newStatus: "rejected",
      });
      await t.mutation(api.designVariations.transitionVariation, {
        variationId,
        newStatus: "exploring",
      });

      const variation = await t.query(api.designVariations.getVariation, {
        variationId,
      });
      expect(variation?.status).toBe("exploring");
    });

    test("rejects invalid transitions", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Option A",
        },
      );

      // selected -> rejected is not allowed
      await t.mutation(api.designVariations.transitionVariation, {
        variationId,
        newStatus: "selected",
      });

      try {
        await t.mutation(api.designVariations.transitionVariation, {
          variationId,
          newStatus: "rejected",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Invalid status transition");
      }
    });

    test("throws for non-existent variation", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);
      const fakeId = designId.replace("designs", "designVariations");

      try {
        await t.mutation(api.designVariations.transitionVariation, {
          variationId: fakeId as any,
          newStatus: "selected",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Variation not found");
      }
    });
  });

  describe("updateVariation", () => {
    test("updates title", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Original Title",
        },
      );

      await t.mutation(api.designVariations.updateVariation, {
        variationId,
        title: "Updated Title",
      });

      const variation = await t.query(api.designVariations.getVariation, {
        variationId,
      });
      expect(variation?.title).toBe("Updated Title");
    });

    test("updates screenshotStorageIds", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Option A",
        },
      );

      await t.mutation(api.designVariations.updateVariation, {
        variationId,
        screenshotStorageIds: ["storage-id-1", "storage-id-2"],
      });

      const variation = await t.query(api.designVariations.getVariation, {
        variationId,
      });
      expect(variation?.screenshotStorageIds).toEqual([
        "storage-id-1",
        "storage-id-2",
      ]);
    });

    test("partial update only modifies specified fields", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);

      const variationId = await t.mutation(
        api.designVariations.createVariation,
        {
          designId: designId as any,
          slug: "option-a",
          title: "Original",
        },
      );

      await t.mutation(api.designVariations.updateVariation, {
        variationId,
        title: "New Title",
      });

      const variation = await t.query(api.designVariations.getVariation, {
        variationId,
      });
      expect(variation?.title).toBe("New Title");
      expect(variation?.slug).toBe("option-a");
    });

    test("throws for non-existent variation", async () => {
      const t = convexTest(schema, modules);
      const designId = await createDesign(t);
      const fakeId = designId.replace("designs", "designVariations");

      try {
        await t.mutation(api.designVariations.updateVariation, {
          variationId: fakeId as any,
          title: "Test",
        });
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toContain("Variation not found");
      }
    });
  });

  describe("generateScreenshotUploadUrl", () => {
    test("returns an upload URL", async () => {
      const t = convexTest(schema, modules);

      const url = await t.mutation(
        api.designVariations.generateScreenshotUploadUrl,
        {},
      );
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
    });
  });

  describe("getScreenshotUrl", () => {
    test("returns URL for stored file", async () => {
      const t = convexTest(schema, modules);

      const storageId = await t.run(async (ctx) => {
        return await ctx.storage.store(new Blob(["test-image-data"]));
      });

      const url = await t.query(api.designVariations.getScreenshotUrl, {
        storageId: storageId as any,
      });
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
    });
  });
});
