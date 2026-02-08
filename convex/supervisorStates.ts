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
    // Find by feature name only (node_id changes across invocations)
    const existing = await ctx.db
      .query("supervisorStates")
      .withIndex("by_feature", (q) => q.eq("featureName", args.featureName))
      .order("desc")
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        nodeId: args.nodeId,
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
    // Query by feature name only — node_id changes across invocations
    return await ctx.db
      .query("supervisorStates")
      .withIndex("by_feature", (q) => q.eq("featureName", args.featureName))
      .order("desc")
      .first();
  },
});
