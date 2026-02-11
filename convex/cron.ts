import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Cleanup expired telemetry data based on retention policy.
 *
 * Retention policy:
 * - Raw success spans/events: 7 days
 * - Raw error/warn spans/events: 30 days
 * - Rollups: 180 days
 */
export const cleanupExpiredTelemetry = internalMutation({
  args: {
    currentTime: v.string(), // RFC3339 timestamp for testing, defaults to now()
  },
  handler: async (ctx, args) => {
    const now = new Date(args.currentTime);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const sevenDaysAgoStr = sevenDaysAgo.toISOString();
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();
    const oneEightyDaysAgoStr = oneEightyDaysAgo.toISOString();

    let deletedSpans = 0;
    let deletedEvents = 0;
    let deletedRollups = 0;

    // Delete expired spans
    const allSpans = await ctx.db.query("telemetrySpans").collect();
    for (const span of allSpans) {
      const isError = span.status === "error" || span.status === "timeout" || span.status === "cancelled";
      const cutoffDate = isError ? thirtyDaysAgoStr : sevenDaysAgoStr;

      if (span.recordedAt < cutoffDate) {
        await ctx.db.delete(span._id);
        deletedSpans++;
      }
    }

    // Delete expired events
    const allEvents = await ctx.db.query("telemetryEvents").collect();
    for (const event of allEvents) {
      const isError = event.severity === "error" || event.severity === "warn";
      const cutoffDate = isError ? thirtyDaysAgoStr : sevenDaysAgoStr;

      if (event.recordedAt < cutoffDate) {
        await ctx.db.delete(event._id);
        deletedEvents++;
      }
    }

    // Delete expired rollups
    const allRollups = await ctx.db.query("telemetryRollups").collect();
    for (const rollup of allRollups) {
      if (rollup.windowStart < oneEightyDaysAgoStr) {
        await ctx.db.delete(rollup._id);
        deletedRollups++;
      }
    }

    return { deletedSpans, deletedEvents, deletedRollups };
  },
});

/**
 * Aggregate spans into rollups for a given time window.
 *
 * Creates one rollup per unique source+operation combination.
 * Calculates p95 and max durations, counts spans/errors/events.
 */
export const aggregateSpansIntoRollups = internalMutation({
  args: {
    windowStart: v.string(),
    windowEnd: v.string(),
    granularityMin: v.number(),
  },
  handler: async (ctx, args) => {
    // Fetch all spans in window
    const allSpans = await ctx.db.query("telemetrySpans").collect();
    const spansInWindow = allSpans.filter(
      (s) => s.recordedAt >= args.windowStart && s.recordedAt < args.windowEnd
    );

    // Fetch all events in window
    const allEvents = await ctx.db.query("telemetryEvents").collect();
    const eventsInWindow = allEvents.filter(
      (e) => e.recordedAt >= args.windowStart && e.recordedAt < args.windowEnd
    );

    // Group spans by source+operation
    const groups = new Map<
      string,
      {
        source: string;
        operation: string;
        spans: typeof spansInWindow;
        orchestrationId?: string;
        phaseNumber?: string;
      }
    >();

    for (const span of spansInWindow) {
      const key = `${span.source}:${span.operation}`;
      if (!groups.has(key)) {
        groups.set(key, {
          source: span.source,
          operation: span.operation,
          spans: [],
          orchestrationId: span.orchestrationId,
          phaseNumber: span.phaseNumber,
        });
      }
      groups.get(key)!.spans.push(span);
    }

    let rollupsCreated = 0;

    for (const group of groups.values()) {
      const { source, operation, spans, orchestrationId, phaseNumber } = group;

      // Calculate metrics
      const spanCount = spans.length;
      const errorCount = spans.filter(
        (s) => s.status === "error" || s.status === "timeout" || s.status === "cancelled"
      ).length;

      // Count events for this source+operation
      const eventCount = eventsInWindow.filter(
        (e) => e.source === source
      ).length;

      // Calculate p95 and max durations
      const durations = spans
        .filter((s) => s.durationMs !== undefined)
        .map((s) => s.durationMs!)
        .sort((a, b) => a - b);

      let p95DurationMs: number | undefined;
      let maxDurationMs: number | undefined;

      if (durations.length > 0) {
        // p95 calculation using linear interpolation
        // Position = 0.95 * (n - 1)
        const position = 0.95 * (durations.length - 1);
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.ceil(position);

        if (lowerIndex === upperIndex) {
          p95DurationMs = durations[lowerIndex];
        } else {
          // Linear interpolation between the two values
          const fraction = position - lowerIndex;
          const lowerValue = durations[lowerIndex];
          const upperValue = durations[upperIndex];
          p95DurationMs = Math.round(lowerValue + fraction * (upperValue - lowerValue));
        }

        maxDurationMs = durations[durations.length - 1];
      }

      // Check if rollup exists (upsert pattern)
      const existing = await ctx.db
        .query("telemetryRollups")
        .withIndex("by_window_source_operation", (q) =>
          q
            .eq("windowStart", args.windowStart)
            .eq("source", source)
            .eq("operation", operation)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          windowEnd: args.windowEnd,
          granularityMin: args.granularityMin,
          orchestrationId: orchestrationId as any,
          phaseNumber,
          spanCount,
          errorCount,
          eventCount,
          p95DurationMs,
          maxDurationMs,
        });
      } else {
        await ctx.db.insert("telemetryRollups", {
          windowStart: args.windowStart,
          windowEnd: args.windowEnd,
          granularityMin: args.granularityMin,
          source,
          operation,
          orchestrationId: orchestrationId as any,
          phaseNumber,
          spanCount,
          errorCount,
          eventCount,
          p95DurationMs,
          maxDurationMs,
        });
      }

      rollupsCreated++;
    }

    return { rollupsCreated };
  },
});

/**
 * Wrapper for cleanup job - calculates currentTime dynamically at runtime.
 */
export const cleanupExpiredTelemetryWrapper = internalMutation({
  args: {},
  handler: async (ctx) => {
    const currentTime = new Date().toISOString();
    return await cleanupExpiredTelemetry(ctx, { currentTime });
  },
});

/**
 * Wrapper for rollup job - calculates time window dynamically at runtime.
 */
export const aggregateSpansIntoRollupsWrapper = internalMutation({
  args: {
    granularityMin: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const granularityMs = args.granularityMin * 60 * 1000;

    // Calculate the last complete time window
    const windowEndMs = Math.floor(now / granularityMs) * granularityMs;
    const windowStartMs = windowEndMs - granularityMs;

    const windowStart = new Date(windowStartMs).toISOString();
    const windowEnd = new Date(windowEndMs).toISOString();

    return await aggregateSpansIntoRollups(ctx, {
      windowStart,
      windowEnd,
      granularityMin: args.granularityMin,
    });
  },
});
