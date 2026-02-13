import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordCommit = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    sha: v.string(),
    shortSha: v.optional(v.string()),
    subject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate by SHA
    const existing = await ctx.db
      .query("commits")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("commits", {
      ...args,
      recordedAt: new Date().toISOString(),
    });
  },
});

export const listCommits = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orchestrationId, phaseNumber } = args;

    if (phaseNumber) {
      return await ctx.db
        .query("commits")
        .withIndex("by_phase", (q) =>
          q
            .eq("orchestrationId", orchestrationId)
            .eq("phaseNumber", phaseNumber)
        )
        .collect();
    }

    return await ctx.db
      .query("commits")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", orchestrationId)
      )
      .collect();
  },
});

export const getCommit = query({
  args: {
    sha: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("commits")
      .withIndex("by_sha", (q) => q.eq("sha", args.sha))
      .first();
  },
});
