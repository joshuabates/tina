import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const ORCHESTRATOR_PHASE_KEY = "__orchestrator__";
const TASK_EVENT_PAGE_SIZE = 256;
const MAX_TASK_EVENT_PAGES = 5000;

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

export async function loadTaskEventsForOrchestration(
  ctx: QueryCtx,
  orchestrationId: Id<"orchestrations">,
) {
  const query = ctx.db
    .query("taskEvents")
    .withIndex("by_orchestration_recorded", (q) =>
      q.eq("orchestrationId", orchestrationId),
    )
    .order("desc");

  const events = [];
  let cursor: string | null = null;
  let pageCount = 0;

  while (true) {
    if (pageCount >= MAX_TASK_EVENT_PAGES) {
      throw new Error(
        `Exceeded ${MAX_TASK_EVENT_PAGES} task event pages for orchestration ${orchestrationId}`,
      );
    }

    const page = await query.paginate({
      cursor,
      numItems: TASK_EVENT_PAGE_SIZE,
    });

    events.push(...page.page);
    pageCount += 1;

    if (page.isDone) {
      break;
    }

    cursor = page.continueCursor;
  }

  return events;
}

export const getCurrentTasks = query({
  args: { orchestrationId: v.id("orchestrations") },
  handler: async (ctx, args) => {
    const events = await loadTaskEventsForOrchestration(ctx, args.orchestrationId);
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
