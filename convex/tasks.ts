import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listTaskEvents = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskEvents")
      .withIndex("by_orchestration_task", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("taskId", args.taskId),
      )
      .collect();
  },
});

export const recordTaskEvent = mutation({
  args: {
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
    taskId: v.string(),
    subject: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    owner: v.optional(v.string()),
    blockedBy: v.optional(v.string()),
    metadata: v.optional(v.string()),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("taskEvents", args);
  },
});
