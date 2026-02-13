import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const startCheck = mutation({
  args: {
    reviewId: v.id("reviews"),
    orchestrationId: v.id("orchestrations"),
    name: v.string(),
    kind: v.union(v.literal("cli"), v.literal("project")),
    command: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error(`Review not found: ${args.reviewId}`);
    }

    const existingChecks = await ctx.db
      .query("reviewChecks")
      .withIndex("by_review_name", (q) =>
        q.eq("reviewId", args.reviewId).eq("name", args.name),
      )
      .collect();
    if (existingChecks.some((check) => check.status === "running")) {
      throw new Error(`Check "${args.name}" is already running`);
    }

    return await ctx.db.insert("reviewChecks", {
      reviewId: args.reviewId,
      orchestrationId: args.orchestrationId,
      name: args.name,
      kind: args.kind,
      command: args.command,
      status: "running",
      startedAt: new Date().toISOString(),
    });
  },
});

export const completeCheck = mutation({
  args: {
    reviewId: v.id("reviews"),
    name: v.string(),
    status: v.union(v.literal("passed"), v.literal("failed")),
    comment: v.optional(v.string()),
    output: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const checks = await ctx.db
      .query("reviewChecks")
      .withIndex("by_review_name", (q) =>
        q.eq("reviewId", args.reviewId).eq("name", args.name),
      )
      .collect();

    if (checks.length === 0) {
      throw new Error(
        `Check "${args.name}" not found for review ${args.reviewId}`,
      );
    }

    const runningChecks = checks.filter((check) => check.status === "running");
    if (runningChecks.length === 0) {
      const latestCheck = checks[checks.length - 1];
      throw new Error(
        `Check "${args.name}" is already completed with status "${latestCheck.status}"`,
      );
    }

    const check = runningChecks[runningChecks.length - 1];
    const completedAt = new Date().toISOString();
    const startMs = new Date(check.startedAt).getTime();
    const endMs = new Date(completedAt).getTime();

    await ctx.db.patch(check._id, {
      status: args.status,
      comment: args.comment,
      output: args.output,
      completedAt,
      durationMs: endMs - startMs,
    });
  },
});

export const listChecksByReview = query({
  args: {
    reviewId: v.id("reviews"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviewChecks")
      .withIndex("by_review", (q) => q.eq("reviewId", args.reviewId))
      .collect();
  },
});
