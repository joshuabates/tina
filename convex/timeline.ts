import { query } from "./_generated/server";
import { v } from "convex/values";
import { extractReasonCode } from "./reasonCodes";

export interface TimelineEntry {
  id: string;
  timestamp: number;
  source: "control_action" | "event" | "action_completion";
  category: string;
  summary: string;
  detail: string | null;
  status: string | null;
  actionType: string | null;
  reasonCode: string | null;
}

export const getUnifiedTimeline = query({
  args: {
    orchestrationId: v.id("orchestrations"),
    limit: v.optional(v.number()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TimelineEntry[]> => {
    const limit = args.limit ?? 100;
    const entries: TimelineEntry[] = [];

    // 1. Control-plane actions (requests + completions)
    const controlActions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_orchestration_created", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();

    for (const action of controlActions) {
      // Request entry (filter by createdAt)
      if (!args.since || action.createdAt >= args.since) {
        entries.push({
          id: `cpa-req-${action._id}`,
          timestamp: action.createdAt,
          source: "control_action",
          category: "request",
          summary: `${action.actionType} requested by ${action.requestedBy}`,
          detail: action.payload,
          status: action.status,
          actionType: action.actionType,
          reasonCode: null,
        });
      }

      // Completion entry (filter by completedAt)
      if (action.completedAt && (!args.since || action.completedAt >= args.since)) {
        let reasonCode: string | null = null;
        if (action.status === "failed" && action.result) {
          reasonCode = extractReasonCode(action.result);
        }

        entries.push({
          id: `cpa-done-${action._id}`,
          timestamp: action.completedAt,
          source: "action_completion",
          category: action.status === "failed" ? "failure" : "success",
          summary: `${action.actionType} ${action.status}`,
          detail: action.result ?? null,
          status: action.status,
          actionType: action.actionType,
          reasonCode,
        });
      }
    }

    // 2. Orchestration events (launch, shutdown, phase transitions, etc.)
    const events = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_orchestration_recorded", (q) =>
        q.eq("orchestrationId", args.orchestrationId),
      )
      .collect();

    for (const event of events) {
      const ts = new Date(event.recordedAt).getTime();
      if (args.since && ts < args.since) continue;

      entries.push({
        id: `evt-${event._id}`,
        timestamp: ts,
        source: "event",
        category: event.eventType,
        summary: event.summary,
        detail: event.detail ?? null,
        status: null,
        actionType: null,
        reasonCode: null,
      });
    }

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => b.timestamp - a.timestamp);

    return entries.slice(0, limit);
  },
});
