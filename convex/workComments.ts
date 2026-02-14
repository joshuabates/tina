import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const addComment = mutation({
  args: {
    projectId: v.id("projects"),
    targetType: v.union(v.literal("spec"), v.literal("ticket")),
    targetId: v.string(),
    authorType: v.union(v.literal("human"), v.literal("agent")),
    authorName: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    let targetProjectId: Id<"projects">;

    // Validate target exists using O(1) lookup
    if (args.targetType === "spec") {
      const spec = await ctx.db.get(args.targetId as Id<"specs">);
      if (!spec) {
        throw new Error(`Spec not found: ${args.targetId}`);
      }
      targetProjectId = spec.projectId;
    } else if (args.targetType === "ticket") {
      const ticket = await ctx.db.get(args.targetId as Id<"tickets">);
      if (!ticket) {
        throw new Error(`Ticket not found: ${args.targetId}`);
      }
      targetProjectId = ticket.projectId;
    } else {
      throw new Error(`Unsupported targetType: ${args.targetType}`);
    }

    if (targetProjectId !== args.projectId) {
      throw new Error(
        `Project mismatch: target belongs to ${targetProjectId}, got ${args.projectId}`,
      );
    }

    // Create comment with current timestamp
    const now = new Date().toISOString();
    const commentId = await ctx.db.insert("workComments", {
      projectId: targetProjectId,
      targetType: args.targetType,
      targetId: args.targetId,
      authorType: args.authorType,
      authorName: args.authorName,
      body: args.body,
      createdAt: now,
    });

    return commentId;
  },
});

export const listComments = query({
  args: {
    targetType: v.union(v.literal("spec"), v.literal("ticket")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("workComments")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .order("asc")
      .collect();
  },
});
