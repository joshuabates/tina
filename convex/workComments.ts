import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const addComment = internalMutation({
  args: {
    projectId: v.id("projects"),
    targetType: v.union(v.literal("design"), v.literal("ticket")),
    targetId: v.string(),
    authorType: v.union(v.literal("human"), v.literal("agent")),
    authorName: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate target exists using O(1) lookup
    if (args.targetType === "design") {
      const design = await ctx.db.get(args.targetId as Id<"designs">);
      if (!design) {
        throw new Error(`Design not found: ${args.targetId}`);
      }
    } else if (args.targetType === "ticket") {
      const ticket = await ctx.db.get(args.targetId as Id<"tickets">);
      if (!ticket) {
        throw new Error(`Ticket not found: ${args.targetId}`);
      }
    }

    // Create comment with current timestamp
    const now = new Date().toISOString();
    const commentId = await ctx.db.insert("workComments", {
      projectId: args.projectId,
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

export const listComments = internalQuery({
  args: {
    targetType: v.union(v.literal("design"), v.literal("ticket")),
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

// Internal test helper - for tests only
export const createDesignForTest = internalMutation({
  args: {
    projectId: v.id("projects"),
    designKey: v.string(),
    title: v.string(),
    markdown: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("designs", {
      projectId: args.projectId,
      designKey: args.designKey,
      title: args.title,
      markdown: args.markdown,
      status: args.status,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Internal test helper - for tests only
export const createTicketForTest = internalMutation({
  args: {
    projectId: v.id("projects"),
    ticketKey: v.string(),
    title: v.string(),
    description: v.string(),
    status: v.string(),
    priority: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    return await ctx.db.insert("tickets", {
      projectId: args.projectId,
      ticketKey: args.ticketKey,
      title: args.title,
      description: args.description,
      status: args.status,
      priority: args.priority,
      createdAt: now,
      updatedAt: now,
    });
  },
});
