import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertSupervisorState = mutation({
  args: {
    nodeId: v.id("nodes"),
    featureName: v.string(),
    stateJson: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("supervisorStates")
      .withIndex("by_feature_node", (q) =>
        q.eq("featureName", args.featureName).eq("nodeId", args.nodeId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        stateJson: args.stateJson,
        updatedAt: args.updatedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("supervisorStates", args);
  },
});

export const getSupervisorState = query({
  args: {
    nodeId: v.id("nodes"),
    featureName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("supervisorStates")
      .withIndex("by_feature_node", (q) =>
        q.eq("featureName", args.featureName).eq("nodeId", args.nodeId),
      )
      .first();
  },
});
