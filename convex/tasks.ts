import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const ORCHESTRATOR_PHASE_KEY = "__orchestrator__";

export function deduplicateTaskEvents<
  T extends { taskId: string; recordedAt: string; phaseNumber?: string | null },
>(events: T[]): T[] {
  const latest = new Map<string, T>();
  for (const event of events) {
    const phaseKey =
      event.phaseNumber && event.phaseNumber.trim().length > 0
        ? event.phaseNumber
        : ORCHESTRATOR_PHASE_KEY;
    const key = `${phaseKey}:${event.taskId}`;
    const existing = latest.get(key);
    if (!existing || event.recordedAt > existing.recordedAt) {
      latest.set(key, event);
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
