import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordCommit = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    sha: v.string(),
    shortSha: v.string(),
    subject: v.string(),
    author: v.string(),
    timestamp: v.string(),
    insertions: v.number(),
    deletions: v.number(),
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
    let q = ctx.db
      .query("commits")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      );

    const commits = await q.collect();

    return args.phaseNumber
      ? commits.filter((c) => c.phaseNumber === args.phaseNumber)
      : commits;
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
