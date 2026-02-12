import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { allocateKey } from "./projectCounters";
import { seedMarkersFromPreset, parsePhaseStructure } from "./designPresets";
import type { ComplexityPreset } from "./designPresets";

export const createDesign = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    markdown: v.string(),
    complexityPreset: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error(`Project not found: ${args.projectId}`);
    }

    const keyNumber = await allocateKey(ctx, args.projectId, "design");
    const designKey = `${project.name.toUpperCase()}-D${keyNumber}`;
    const now = new Date().toISOString();

    const insertFields: Record<string, unknown> = {
      projectId: args.projectId,
      designKey,
      title: args.title,
      markdown: args.markdown,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };

    if (args.complexityPreset) {
      const preset = args.complexityPreset as ComplexityPreset;
      const requiredMarkers = seedMarkersFromPreset(preset);
      const { phaseCount, phaseStructureValid } = parsePhaseStructure(args.markdown);

      insertFields.complexityPreset = preset;
      insertFields.requiredMarkers = requiredMarkers;
      insertFields.completedMarkers = [];
      insertFields.phaseCount = phaseCount;
      insertFields.phaseStructureValid = phaseStructureValid;
      insertFields.validationUpdatedAt = now;
    }

    return await ctx.db.insert("designs", insertFields as any);
  },
});

export const getDesign = query({
  args: {
    designId: v.id("designs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.designId);
  },
});

export const getDesignByKey = query({
  args: {
    designKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("designs")
      .withIndex("by_key", (q) => q.eq("designKey", args.designKey))
      .first();
  },
});

export const listDesigns = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let queryObj;
    const status = args.status;

    if (status !== undefined) {
      queryObj = ctx.db
        .query("designs")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", status),
        );
    } else {
      queryObj = ctx.db
        .query("designs")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId));
    }

    return await queryObj.order("desc").collect();
  },
});

export const updateDesign = mutation({
  args: {
    designId: v.id("designs"),
    title: v.optional(v.string()),
    markdown: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (args.title !== undefined) {
      updates.title = args.title;
    }
    if (args.markdown !== undefined) {
      updates.markdown = args.markdown;
      const { phaseCount, phaseStructureValid } = parsePhaseStructure(args.markdown);
      updates.phaseCount = phaseCount;
      updates.phaseStructureValid = phaseStructureValid;
      updates.validationUpdatedAt = now;
    }

    await ctx.db.patch(args.designId, updates);
    return args.designId;
  },
});

export const transitionDesign = mutation({
  args: {
    designId: v.id("designs"),
    newStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const validTransitions: Record<string, string[]> = {
      draft: ["in_review"],
      in_review: ["approved", "draft"],
      approved: ["archived"],
      archived: ["draft"],
    };

    const allowed = validTransitions[design.status] || [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid status transition from ${design.status} to ${args.newStatus}`,
      );
    }

    const now = new Date().toISOString();
    const update: Record<string, string | undefined> = {
      status: args.newStatus,
      updatedAt: now,
    };

    // Set archivedAt when moving to archived status
    if (args.newStatus === "archived") {
      update.archivedAt = now;
    } else {
      // Clear archivedAt when unarchiving
      update.archivedAt = undefined;
    }

    await ctx.db.patch(args.designId, update);
    return args.designId;
  },
});

export const updateDesignMarkers = mutation({
  args: {
    designId: v.id("designs"),
    completedMarkers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.designId, {
      completedMarkers: args.completedMarkers,
      validationUpdatedAt: now,
      updatedAt: now,
    });
    return args.designId;
  },
});
