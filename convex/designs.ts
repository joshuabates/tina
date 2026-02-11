import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { allocateKey } from "./projectCounters";

export const createDesign = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    markdown: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error(`Project not found: ${args.projectId}`);
    }

    const keyNumber = await allocateKey(ctx, args.projectId, "design");
    const designKey = `${project.name.toUpperCase()}-D${keyNumber}`;
    const now = new Date().toISOString();

    return await ctx.db.insert("designs", {
      projectId: args.projectId,
      designKey,
      title: args.title,
      markdown: args.markdown,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
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
    projectId: v.id("projects"),
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
    let query_obj = ctx.db
      .query("designs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId));

    if (args.status) {
      query_obj = query_obj.filter((q) => q.eq(q.field("status"), args.status));
    }

    return await query_obj.collect();
  },
});

export const updateDesign = mutation({
  args: {
    designId: v.id("designs"),
    updates: v.object({
      title: v.optional(v.string()),
      markdown: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.designId, {
      ...args.updates,
      updatedAt: now,
    });
    return await ctx.db.get(args.designId);
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
    } else if (design.status === "archived" && args.newStatus !== "archived") {
      // Clear archivedAt when unarchiving
      update.archivedAt = undefined;
    }

    await ctx.db.patch(args.designId, update);
    return await ctx.db.get(args.designId);
  },
});
