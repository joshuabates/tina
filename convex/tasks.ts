import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export function deduplicateTaskEvents<
  T extends { taskId: string; recordedAt: string },
>(events: T[]): T[] {
  const latest = new Map<string, T>();
  for (const event of events) {
    const existing = latest.get(event.taskId);
    if (!existing || event.recordedAt > existing.recordedAt) {
      latest.set(event.taskId, event);
    }
  }
  return Array.from(latest.values());
}

export const getCurrentTasks = query({
  args: { orchestrationId: v.id("orchestrations") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("taskEvents")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();
    return deduplicateTaskEvents(events);
  },
});

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
