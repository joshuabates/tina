import { query } from "./_generated/server";
import { v } from "convex/values";
import { extractReasonCode } from "./reasonCodes";

/**
 * Launch success rate: fraction of start_orchestration actions that completed
 * successfully vs total attempted.
 */
export const launchSuccessRate = query({
  args: {
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.since ?? 0;

    const actions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_status_created")
      .collect();

    const launches = actions.filter(
      (a) => a.actionType === "start_orchestration" && a.createdAt >= cutoff,
    );

    const total = launches.length;
    if (total === 0) return { total: 0, succeeded: 0, failed: 0, rate: null };

    const succeeded = launches.filter((a) => a.status === "completed").length;
    const failed = launches.filter((a) => a.status === "failed").length;

    return {
      total,
      succeeded,
      failed,
      rate: succeeded / total,
    };
  },
});

/**
 * Action latency: time from createdAt to completedAt for completed actions,
 * grouped by action type. Returns median and p95 for each type.
 */
export const actionLatency = query({
  args: {
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.since ?? 0;

    const actions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_status_created")
      .collect();

    const completed = actions.filter(
      (a) => a.completedAt && a.createdAt >= cutoff,
    );

    const byType: Record<string, number[]> = {};
    for (const action of completed) {
      const latency = action.completedAt! - action.createdAt;
      if (!byType[action.actionType]) byType[action.actionType] = [];
      byType[action.actionType].push(latency);
    }

    const results: Record<
      string,
      { count: number; medianMs: number; p95Ms: number }
    > = {};
    for (const [type, latencies] of Object.entries(byType)) {
      latencies.sort((a, b) => a - b);
      const mid = Math.floor(latencies.length / 2);
      const median =
        latencies.length % 2 === 0
          ? (latencies[mid - 1] + latencies[mid]) / 2
          : latencies[mid];
      const p95Idx = Math.min(
        Math.ceil(latencies.length * 0.95) - 1,
        latencies.length - 1,
      );
      results[type] = {
        count: latencies.length,
        medianMs: Math.round(median),
        p95Ms: Math.round(latencies[p95Idx]),
      };
    }

    return results;
  },
});

/**
 * Failure distribution: count of failed actions grouped by action type
 * and reason code (extracted from result JSON).
 */
export const failureDistribution = query({
  args: {
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = args.since ?? 0;

    const actions = await ctx.db
      .query("controlPlaneActions")
      .withIndex("by_status_created")
      .collect();

    const failed = actions.filter(
      (a) => a.status === "failed" && a.createdAt >= cutoff,
    );

    const distribution: Record<string, Record<string, number>> = {};
    for (const action of failed) {
      const actionType = action.actionType;
      let reasonCode = "unknown";
      if (action.result) {
        const extracted = extractReasonCode(action.result);
        reasonCode = extracted ?? "unclassified";
      }

      if (!distribution[actionType]) distribution[actionType] = {};
      distribution[actionType][reasonCode] =
        (distribution[actionType][reasonCode] ?? 0) + 1;
    }

    return {
      totalFailed: failed.length,
      byActionType: distribution,
    };
  },
});
