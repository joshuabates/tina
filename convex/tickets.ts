import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { allocateKey } from "./projectCounters";

export const createTicket = mutation({
  args: {
    projectId: v.id("projects"),
    designId: v.optional(v.id("designs")),
    title: v.string(),
    description: v.string(),
    priority: v.string(), // low | medium | high | urgent
    assignee: v.optional(v.string()),
    estimate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error(`Project not found: ${args.projectId}`);
    }

    if (args.designId) {
      const design = await ctx.db.get(args.designId);
      if (!design) {
        throw new Error(`Design not found: ${args.designId}`);
      }
    }

    const keyNumber = await allocateKey(ctx, args.projectId, "ticket");
    const ticketKey = `${project.name.toUpperCase()}-${keyNumber}`;
    const now = new Date().toISOString();

    return await ctx.db.insert("tickets", {
      projectId: args.projectId,
      designId: args.designId,
      ticketKey,
      title: args.title,
      description: args.description,
      status: "todo",
      priority: args.priority,
      assignee: args.assignee,
      estimate: args.estimate,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getTicket = query({
  args: {
    ticketId: v.id("tickets"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.ticketId);
  },
});

export const getTicketByKey = query({
  args: {
    projectId: v.id("projects"),
    ticketKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_key", (q) =>
        q.eq("ticketKey", args.ticketKey),
      )
      .first();
  },
});

export const listTickets = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.string()),
    designId: v.optional(v.id("designs")),
    assignee: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query_obj = ctx.db
      .query("tickets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId));

    if (args.status) {
      query_obj = query_obj.filter((q) => q.eq(q.field("status"), args.status));
    }

    if (args.designId) {
      query_obj = query_obj.filter((q) => q.eq(q.field("designId"), args.designId));
    }

    if (args.assignee) {
      query_obj = query_obj.filter((q) => q.eq(q.field("assignee"), args.assignee));
    }

    return await query_obj.collect();
  },
});

export const updateTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    updates: v.object({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
      priority: v.optional(v.string()),
      assignee: v.optional(v.string()),
      estimate: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.patch(args.ticketId, {
      ...args.updates,
      updatedAt: now,
    });
    return await ctx.db.get(args.ticketId);
  },
});

export const transitionTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    newStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found: ${args.ticketId}`);
    }

    const validTransitions: Record<string, string[]> = {
      todo: ["in_progress", "blocked", "canceled"],
      in_progress: ["in_review", "blocked", "canceled"],
      in_review: ["done", "in_progress"],
      blocked: ["todo", "in_progress", "canceled"],
      done: ["todo"],
      canceled: ["todo"],
    };

    const allowed = validTransitions[ticket.status] || [];
    if (!allowed.includes(args.newStatus)) {
      throw new Error(
        `Invalid status transition from ${ticket.status} to ${args.newStatus}`,
      );
    }

    const now = new Date().toISOString();
    const update: Record<string, string | undefined> = {
      status: args.newStatus,
      updatedAt: now,
    };

    // Set closedAt for terminal states
    if (args.newStatus === "done" || args.newStatus === "canceled") {
      update.closedAt = now;
    } else {
      // Clear closedAt when reopening
      update.closedAt = undefined;
    }

    await ctx.db.patch(args.ticketId, update);
    return await ctx.db.get(args.ticketId);
  },
});
