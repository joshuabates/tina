import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createDesign, createProject, createSpec } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("specDesigns", () => {
  describe("linkSpecToDesign", () => {
    test("creates link between spec and design", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const specId = await createSpec(t, { projectId });
      const designId = await createDesign(t, { projectId });

      const linkId = await t.mutation(api.specDesigns.linkSpecToDesign, {
        specId: specId as any,
        designId: designId as any,
      });

      expect(linkId).toBeDefined();
    });

    test("throws when spec does not exist", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const designId = await createDesign(t, { projectId });

      // Create and delete a spec to get a valid-format but non-existent ID
      const deletedSpecId = await createSpec(t, { projectId });
      await t.run(async (ctx) => {
        await ctx.db.delete(deletedSpecId as any);
      });

      await expect(
        t.mutation(api.specDesigns.linkSpecToDesign, {
          specId: deletedSpecId as any,
          designId: designId as any,
        }),
      ).rejects.toThrow(/Spec not found/);
    });

    test("throws when design does not exist", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const specId = await createSpec(t, { projectId });

      // Create and delete a design to get a valid-format but non-existent ID
      const deletedDesignId = await createDesign(t, { projectId });
      await t.run(async (ctx) => {
        await ctx.db.delete(deletedDesignId as any);
      });

      await expect(
        t.mutation(api.specDesigns.linkSpecToDesign, {
          specId: specId as any,
          designId: deletedDesignId as any,
        }),
      ).rejects.toThrow(/Design not found/);
    });

    test("is idempotent - returns existing link if already linked", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const specId = await createSpec(t, { projectId });
      const designId = await createDesign(t, { projectId });

      const linkId1 = await t.mutation(api.specDesigns.linkSpecToDesign, {
        specId: specId as any,
        designId: designId as any,
      });

      const linkId2 = await t.mutation(api.specDesigns.linkSpecToDesign, {
        specId: specId as any,
        designId: designId as any,
      });

      expect(linkId1).toBe(linkId2);
    });
  });

  describe("unlinkSpecFromDesign", () => {
    test("removes existing link", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const specId = await createSpec(t, { projectId });
      const designId = await createDesign(t, { projectId });

      await t.mutation(api.specDesigns.linkSpecToDesign, {
        specId: specId as any,
        designId: designId as any,
      });

      await t.mutation(api.specDesigns.unlinkSpecFromDesign, {
        specId: specId as any,
        designId: designId as any,
      });

      const designs = await t.query(api.specDesigns.listDesignsForSpec, {
        specId: specId as any,
      });
      expect(designs).toHaveLength(0);
    });

    test("is a no-op when link does not exist", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const specId = await createSpec(t, { projectId });
      const designId = await createDesign(t, { projectId });

      // Should not throw
      await t.mutation(api.specDesigns.unlinkSpecFromDesign, {
        specId: specId as any,
        designId: designId as any,
      });

      const designs = await t.query(api.specDesigns.listDesignsForSpec, {
        specId: specId as any,
      });
      expect(designs).toHaveLength(0);
    });
  });

  describe("listDesignsForSpec", () => {
    test("returns all designs linked to a spec", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const specId = await createSpec(t, { projectId });
      const designId1 = await createDesign(t, { projectId });
      const designId2 = await createDesign(t, { projectId });

      await t.mutation(api.specDesigns.linkSpecToDesign, {
        specId: specId as any,
        designId: designId1 as any,
      });
      await t.mutation(api.specDesigns.linkSpecToDesign, {
        specId: specId as any,
        designId: designId2 as any,
      });

      const designs = await t.query(api.specDesigns.listDesignsForSpec, {
        specId: specId as any,
      });

      expect(designs).toHaveLength(2);
      const designIds = designs.map((d: any) => d._id);
      expect(designIds).toContain(designId1);
      expect(designIds).toContain(designId2);
    });

    test("returns empty array when spec has no linked designs", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const specId = await createSpec(t, { projectId });

      const designs = await t.query(api.specDesigns.listDesignsForSpec, {
        specId: specId as any,
      });

      expect(designs).toHaveLength(0);
    });
  });

  describe("listSpecsForDesign", () => {
    test("returns all specs linked to a design", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const specId1 = await createSpec(t, { projectId, title: "Spec 1" });
      const specId2 = await createSpec(t, { projectId, title: "Spec 2" });
      const designId = await createDesign(t, { projectId });

      await t.mutation(api.specDesigns.linkSpecToDesign, {
        specId: specId1 as any,
        designId: designId as any,
      });
      await t.mutation(api.specDesigns.linkSpecToDesign, {
        specId: specId2 as any,
        designId: designId as any,
      });

      const specs = await t.query(api.specDesigns.listSpecsForDesign, {
        designId: designId as any,
      });

      expect(specs).toHaveLength(2);
      const specIds = specs.map((s: any) => s._id);
      expect(specIds).toContain(specId1);
      expect(specIds).toContain(specId2);
    });

    test("returns empty array when design has no linked specs", async () => {
      const t = convexTest(schema, modules);
      const projectId = await createProject(t);
      const designId = await createDesign(t, { projectId });

      const specs = await t.query(api.specDesigns.listSpecsForDesign, {
        designId: designId as any,
      });

      expect(specs).toHaveLength(0);
    });
  });
});
