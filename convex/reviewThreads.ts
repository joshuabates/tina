import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createThread = mutation({
  args: {
    reviewId: v.id("reviews"),
    orchestrationId: v.id("orchestrations"),
    filePath: v.string(),
    line: v.number(),
    commitSha: v.string(),
    summary: v.string(),
    body: v.string(),
    severity: v.union(v.literal("p0"), v.literal("p1"), v.literal("p2")),
    source: v.union(v.literal("human"), v.literal("agent")),
    author: v.string(),
    gateImpact: v.union(
      v.literal("plan"),
      v.literal("review"),
      v.literal("finalize"),
    ),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error(`Review not found: ${args.reviewId}`);
    }

    return await ctx.db.insert("reviewThreads", {
      reviewId: args.reviewId,
      orchestrationId: args.orchestrationId,
      filePath: args.filePath,
      line: args.line,
      commitSha: args.commitSha,
      summary: args.summary,
      body: args.body,
      severity: args.severity,
      status: "unresolved",
      source: args.source,
      author: args.author,
      gateImpact: args.gateImpact,
      createdAt: new Date().toISOString(),
    });
  },
});

export const resolveThread = mutation({
  args: {
    threadId: v.id("reviewThreads"),
    resolvedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new Error(`Review thread not found: ${args.threadId}`);
    }
    if (thread.status === "resolved") {
      throw new Error("Thread is already resolved");
    }

    await ctx.db.patch(args.threadId, {
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      resolvedBy: args.resolvedBy,
    });
  },
});

export const listThreadsByReview = query({
  args: {
    reviewId: v.id("reviews"),
    status: v.optional(
      v.union(v.literal("unresolved"), v.literal("resolved")),
    ),
  },
  handler: async (ctx, args) => {
    if (args.status !== undefined) {
      return await ctx.db
        .query("reviewThreads")
        .withIndex("by_review_status", (q) =>
          q.eq("reviewId", args.reviewId).eq("status", args.status!),
        )
        .collect();
    }
    return await ctx.db
      .query("reviewThreads")
      .withIndex("by_review", (q) => q.eq("reviewId", args.reviewId))
      .collect();
  },
});

export const listThreadsByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewThreads")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();
  },
});
