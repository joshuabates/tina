import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { allocateKey } from "./projectCounters";
import { seedMarkersFromPreset, parsePhaseStructure } from "./specPresets";
import type { ComplexityPreset } from "./specPresets";

export const createSpec = mutation({
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

    const keyNumber = await allocateKey(ctx, args.projectId, "spec");
    const specKey = `${project.name.toUpperCase()}-S${keyNumber}`;
    const now = new Date().toISOString();

    if (args.complexityPreset) {
      const preset = args.complexityPreset as ComplexityPreset;
      const requiredMarkers = seedMarkersFromPreset(preset);
      const { phaseCount, phaseStructureValid } = parsePhaseStructure(args.markdown);
      return await ctx.db.insert("specs", {
        projectId: args.projectId,
        specKey,
        title: args.title,
        markdown: args.markdown,
        status: "draft",
        createdAt: now,
        updatedAt: now,
        complexityPreset: preset,
        requiredMarkers,
        completedMarkers: [],
        phaseCount,
        phaseStructureValid,
        validationUpdatedAt: now,
      });
    } else {
      return await ctx.db.insert("specs", {
        projectId: args.projectId,
        specKey,
        title: args.title,
        markdown: args.markdown,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const getSpec = query({
  args: {
    specId: v.id("specs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.specId);
  },
});

export const getSpecByKey = query({
  args: {
    specKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("specs")
      .withIndex("by_key", (q) => q.eq("specKey", args.specKey))
      .first();
  },
});

export const listSpecs = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let queryObj;
    const status = args.status;

    if (status !== undefined) {
      queryObj = ctx.db
        .query("specs")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", status),
        );
    } else {
      queryObj = ctx.db
        .query("specs")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId));
    }

    return await queryObj.order("desc").collect();
  },
});

export const updateSpec = mutation({
  args: {
    specId: v.id("specs"),
    title: v.optional(v.string()),
    markdown: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const spec = await ctx.db.get(args.specId);
    if (!spec) {
      throw new Error(`Spec not found: ${args.specId}`);
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

    await ctx.db.patch(args.specId, updates);
    return args.specId;
  },
});

export const transitionSpec = mutation({
  args: {
    specId: v.id("specs"),
    newStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const spec = await ctx.db.get(args.specId);
    if (!spec) {
      throw new Error(`Spec not found: ${args.specId}`);
    }

    const validTransitions: Record<string, string[]> = {
      draft: ["in_review"],
      in_review: ["approved", "draft"],
      approved: ["archived"],
      archived: ["draft"],
    };

    const allowed = validTransitions[spec.status] || [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid status transition from ${spec.status} to ${args.newStatus}`,
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

    await ctx.db.patch(args.specId, update);
    return args.specId;
  },
});

export const updateSpecMarkers = mutation({
  args: {
    specId: v.id("specs"),
    completedMarkers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const spec = await ctx.db.get(args.specId);
    if (!spec) {
      throw new Error(`Spec not found: ${args.specId}`);
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.specId, {
      completedMarkers: args.completedMarkers,
      validationUpdatedAt: now,
      updatedAt: now,
    });
    return args.specId;
  },
});
