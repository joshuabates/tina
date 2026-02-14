import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const linkSpecToDesign = mutation({
  args: {
    specId: v.id("specs"),
    designId: v.id("designs"),
  },
  handler: async (ctx, args) => {
    const spec = await ctx.db.get(args.specId);
    if (!spec) {
      throw new Error(`Spec not found: ${args.specId}`);
    }

    const design = await ctx.db.get(args.designId);
    if (!design) {
      throw new Error(`Design not found: ${args.designId}`);
    }

    const existing = await ctx.db
      .query("specDesigns")
      .withIndex("by_spec", (q) => q.eq("specId", args.specId))
      .collect();

    const match = existing.find((link) => link.designId === args.designId);
    if (match) {
      return match._id;
    }

    return await ctx.db.insert("specDesigns", {
      specId: args.specId,
      designId: args.designId,
    });
  },
});

export const unlinkSpecFromDesign = mutation({
  args: {
    specId: v.id("specs"),
    designId: v.id("designs"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("specDesigns")
      .withIndex("by_spec", (q) => q.eq("specId", args.specId))
      .collect();

    const match = existing.find((link) => link.designId === args.designId);
    if (match) {
      await ctx.db.delete(match._id);
    }
  },
});

export const listDesignsForSpec = query({
  args: {
    specId: v.id("specs"),
  },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("specDesigns")
      .withIndex("by_spec", (q) => q.eq("specId", args.specId))
      .collect();

    const designs = await Promise.all(
      links.map((link) => ctx.db.get(link.designId)),
    );

    return designs.filter((d) => d !== null);
  },
});

export const listSpecsForDesign = query({
  args: {
    designId: v.id("designs"),
  },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("specDesigns")
      .withIndex("by_design", (q) => q.eq("designId", args.designId))
      .collect();

    const specs = await Promise.all(
      links.map((link) => ctx.db.get(link.specId)),
    );

    return specs.filter((s) => s !== null);
  },
});
