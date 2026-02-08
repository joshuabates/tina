import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const submitAction = mutation({
  args: {
    nodeId: v.id("nodes"),
    orchestrationId: v.id("orchestrations"),
    type: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("inboundActions", {
      nodeId: args.nodeId,
      orchestrationId: args.orchestrationId,
      type: args.type,
      payload: args.payload,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const claimAction = mutation({
  args: {
    actionId: v.id("inboundActions"),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action) {
      return { success: false, reason: "not_found" };
    }
    if (action.status !== "pending") {
      return { success: false, reason: "already_claimed" };
    }
    await ctx.db.patch(args.actionId, {
      status: "claimed",
      claimedAt: Date.now(),
    });
    return { success: true };
  },
});

export const completeAction = mutation({
  args: {
    actionId: v.id("inboundActions"),
    result: v.string(),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    const action = await ctx.db.get(args.actionId);
    if (!action) {
      throw new Error(`Action ${args.actionId} not found`);
    }
    await ctx.db.patch(args.actionId, {
      status: args.success ? "completed" : "failed",
      result: args.result,
      completedAt: Date.now(),
    });
  },
});

export const pendingActions = query({
  args: {
    nodeId: v.id("nodes"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inboundActions")
      .withIndex("by_node_status", (q) =>
        q.eq("nodeId", args.nodeId).eq("status", "pending"),
      )
      .collect();
  },
});
