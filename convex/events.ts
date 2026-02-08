import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const recordEvent = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
    eventType: v.string(),
    source: v.string(),
    summary: v.string(),
    detail: v.optional(v.string()),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("orchestrationEvents", args);
  },
});

export const listEvents = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    since: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageLimit = args.limit ?? 100;

    let q = ctx.db
      .query("orchestrationEvents")
      .withIndex("by_orchestration_recorded", (q) => {
        const base = q.eq("orchestrationId", args.orchestrationId);
        if (args.since) {
          return base.gt("recordedAt", args.since);
        }
        return base;
      })
      .order("asc");

    const events = await q.take(pageLimit);
    return events;
  },
});
