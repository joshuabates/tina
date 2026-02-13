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
    const check = await ctx.db
      .query("reviewChecks")
      .withIndex("by_review_name", (q) =>
        q.eq("reviewId", args.reviewId).eq("name", args.name),
      )
      .first();

    if (!check) {
      throw new Error(
        `Check "${args.name}" not found for review ${args.reviewId}`,
      );
    }
    if (check.status !== "running") {
      throw new Error(
        `Check "${args.name}" is already completed with status "${check.status}"`,
      );
    }

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
