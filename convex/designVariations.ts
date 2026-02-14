import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const createVariation = mutation({
  args: {
    designId: v.id("designs"),
    slug: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const now = new Date().toISOString();
    return await ctx.db.insert("designVariations", {
      designId: args.designId,
      slug: args.slug,
      title: args.title,
      status: "exploring",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getVariation = query({
  args: {
    variationId: v.id("designVariations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.variationId);
  },
});

export const listVariations = query({
  args: {
    designId: v.id("designs"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const status = args.status;

    if (status !== undefined) {
      return await ctx.db
        .query("designVariations")
        .withIndex("by_design_status", (q) =>
          q.eq("designId", args.designId).eq("status", status),
        )
        .collect();
    }

    return await ctx.db
      .query("designVariations")
      .withIndex("by_design", (q) => q.eq("designId", args.designId))
      .collect();
  },
});

export const transitionVariation = mutation({
  args: {
    variationId: v.id("designVariations"),
    newStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const variation = await ctx.db.get(args.variationId);
    if (!variation) {
      throw new Error(`Variation not found: ${args.variationId}`);
    }

    const validTransitions: Record<string, string[]> = {
      exploring: ["selected", "rejected"],
      selected: ["exploring"],
      rejected: ["exploring"],
    };

    const allowed = validTransitions[variation.status] || [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid status transition from ${variation.status} to ${args.newStatus}`,
      );
    }

    const now = new Date().toISOString();
    await ctx.db.patch(args.variationId, {
      status: args.newStatus,
      updatedAt: now,
    });
    return args.variationId;
  },
});

export const updateVariation = mutation({
  args: {
    variationId: v.id("designVariations"),
    title: v.optional(v.string()),
    screenshotStorageIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const variation = await ctx.db.get(args.variationId);
    if (!variation) {
      throw new Error(`Variation not found: ${args.variationId}`);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (args.title !== undefined) {
      updates.title = args.title;
    }
    if (args.screenshotStorageIds !== undefined) {
      updates.screenshotStorageIds = args.screenshotStorageIds;
    }

    await ctx.db.patch(args.variationId, updates);
    return args.variationId;
  },
});

export const generateScreenshotUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getScreenshotUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
