import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createReview = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
    reviewerAgent: v.string(),
  },
  handler: async (ctx, args) => {
    const orchestration = await ctx.db.get(args.orchestrationId);
    if (!orchestration) {
      throw new Error(`Orchestration not found: ${args.orchestrationId}`);
    }

    return await ctx.db.insert("reviews", {
      orchestrationId: args.orchestrationId,
      phaseNumber: args.phaseNumber,
      state: "open",
      reviewerAgent: args.reviewerAgent,
      startedAt: new Date().toISOString(),
    });
  },
});

export const completeReview = mutation({
  args: {
    reviewId: v.id("reviews"),
    state: v.union(
      v.literal("approved"),
      v.literal("changes_requested"),
      v.literal("superseded"),
    ),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error(`Review not found: ${args.reviewId}`);
    }
    if (review.state !== "open") {
      throw new Error(
        `Cannot complete review in state "${review.state}", must be "open"`,
      );
    }

    await ctx.db.patch(args.reviewId, {
      state: args.state,
      completedAt: new Date().toISOString(),
    });
  },
});

export const getReview = query({
  args: {
    reviewId: v.id("reviews"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reviewId);
  },
});

export const listReviewsByOrchestration = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .order("desc")
      .collect();

    if (args.phaseNumber !== undefined) {
      return reviews.filter((r) => r.phaseNumber === args.phaseNumber);
    }
    return reviews;
  },
});
