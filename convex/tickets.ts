import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
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
      if (design.projectId !== args.projectId) {
        throw new Error(
          `Design ${args.designId} does not belong to project ${args.projectId}`,
        );
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
    let queryObj;
    const status = args.status;

    // Use proper indexes based on filters
    if (args.designId) {
      queryObj = ctx.db
        .query("tickets")
        .withIndex("by_design", (q) => q.eq("designId", args.designId));
      queryObj = queryObj.filter((q) =>
        q.eq(q.field("projectId"), args.projectId),
      );
    } else if (status !== undefined) {
      queryObj = ctx.db
        .query("tickets")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", status),
        );
    } else {
      queryObj = ctx.db
        .query("tickets")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId));
    }

    if (args.assignee) {
      queryObj = queryObj.filter((q) => q.eq(q.field("assignee"), args.assignee));
    }

    if (args.designId && status !== undefined) {
      queryObj = queryObj.filter((q) => q.eq(q.field("status"), status));
    }

    return await queryObj.order("desc").collect();
  },
});

export const updateTicket = mutation({
  args: {
    ticketId: v.id("tickets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.string()),
    designId: v.optional(v.id("designs")),
    clearDesignId: v.optional(v.boolean()),
    assignee: v.optional(v.string()),
    estimate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found: ${args.ticketId}`);
    }

    if (args.clearDesignId && args.designId !== undefined) {
      throw new Error("Cannot provide both designId and clearDesignId");
    }

    if (args.designId) {
      const design = await ctx.db.get(args.designId);
      if (!design) {
        throw new Error(`Design not found: ${args.designId}`);
      }
      if (design.projectId !== ticket.projectId) {
        throw new Error(
          `Design ${args.designId} does not belong to ticket project ${ticket.projectId}`,
        );
      }
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (args.title !== undefined) {
      updates.title = args.title;
    }
    if (args.description !== undefined) {
      updates.description = args.description;
    }
    if (args.priority !== undefined) {
      updates.priority = args.priority;
    }
    if (args.designId !== undefined) {
      updates.designId = args.designId;
    } else if (args.clearDesignId) {
      updates.designId = undefined;
    }
    if (args.assignee !== undefined) {
      updates.assignee = args.assignee;
    }
    if (args.estimate !== undefined) {
      updates.estimate = args.estimate;
    }

    await ctx.db.patch(args.ticketId, updates);
    return args.ticketId;
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
    return args.ticketId;
  },
});
