import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    sessionName: v.string(),
    tmuxPaneId: v.string(),
    label: v.string(),
    cli: v.string(),
    status: v.union(v.literal("active"), v.literal("ended")),
    contextType: v.optional(v.string()),
    contextId: v.optional(v.string()),
    contextSummary: v.optional(v.string()),
    createdAt: v.number(),
    endedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("terminalSessions")
      .withIndex("by_sessionName", (q) => q.eq("sessionName", args.sessionName))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tmuxPaneId: args.tmuxPaneId,
        label: args.label,
        cli: args.cli,
        status: args.status,
        contextType: args.contextType ?? existing.contextType,
        contextId: args.contextId ?? existing.contextId,
        contextSummary: args.contextSummary ?? existing.contextSummary,
        endedAt: args.endedAt ?? existing.endedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("terminalSessions", args);
  },
});

export const markEnded = mutation({
  args: {
    sessionName: v.string(),
    endedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("terminalSessions")
      .withIndex("by_sessionName", (q) => q.eq("sessionName", args.sessionName))
      .first();

    if (!existing) {
      throw new Error(`Terminal session not found: ${args.sessionName}`);
    }

    await ctx.db.patch(existing._id, {
      status: "ended",
      endedAt: args.endedAt,
    });
  },
});

export const getBySessionName = query({
  args: {
    sessionName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("terminalSessions")
      .withIndex("by_sessionName", (q) => q.eq("sessionName", args.sessionName))
      .first();
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("terminalSessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});
