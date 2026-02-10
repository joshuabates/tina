import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertPlan = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    planPath: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("plans")
      .withIndex("by_phase", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("phaseNumber", args.phaseNumber)
      )
      .first();

    const lastSynced = new Date().toISOString();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content: args.content,
        planPath: args.planPath,
        lastSynced,
      });
      return existing._id;
    }

    return await ctx.db.insert("plans", { ...args, lastSynced });
  },
});

export const getPlan = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_phase", (q) =>
        q
          .eq("orchestrationId", args.orchestrationId)
          .eq("phaseNumber", args.phaseNumber)
      )
      .first();
  },
});

export const listPlans = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("plans")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      )
      .collect();
  },
});
