import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const recordSpan = mutation({
  args: {
    traceId: v.string(),
    spanId: v.string(),
    parentSpanId: v.optional(v.string()),
    orchestrationId: v.optional(v.id("orchestrations")),
    featureName: v.optional(v.string()),
    phaseNumber: v.optional(v.string()),
    teamName: v.optional(v.string()),
    taskId: v.optional(v.string()),
    source: v.string(),
    operation: v.string(),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    status: v.string(),
    errorCode: v.optional(v.string()),
    errorDetail: v.optional(v.string()),
    attrs: v.optional(v.string()),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate by spanId
    const existing = await ctx.db
      .query("telemetrySpans")
      .withIndex("by_span_id", (q) => q.eq("spanId", args.spanId))
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("telemetrySpans", args);
  },
});

export const recordEvent = mutation({
  args: {
    traceId: v.string(),
    spanId: v.string(),
    parentSpanId: v.optional(v.string()),
    orchestrationId: v.optional(v.id("orchestrations")),
    featureName: v.optional(v.string()),
    phaseNumber: v.optional(v.string()),
    teamName: v.optional(v.string()),
    taskId: v.optional(v.string()),
    source: v.string(),
    eventType: v.string(),
    severity: v.string(),
    message: v.string(),
    status: v.optional(v.string()),
    attrs: v.optional(v.string()),
    recordedAt: v.string(),
  },
  handler: async (ctx, args) => {
    // Append-only, no deduplication
    return await ctx.db.insert("telemetryEvents", args);
  },
});

export const recordRollup = mutation({
  args: {
    windowStart: v.string(),
    windowEnd: v.string(),
    granularityMin: v.number(),
    source: v.string(),
    operation: v.string(),
    orchestrationId: v.optional(v.id("orchestrations")),
    phaseNumber: v.optional(v.string()),
    spanCount: v.number(),
    errorCount: v.number(),
    eventCount: v.number(),
    p95DurationMs: v.optional(v.number()),
    maxDurationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Upsert by window+source+operation
    const existing = await ctx.db
      .query("telemetryRollups")
      .withIndex("by_window_source_operation", (q) =>
        q
          .eq("windowStart", args.windowStart)
          .eq("source", args.source)
          .eq("operation", args.operation)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        windowEnd: args.windowEnd,
        granularityMin: args.granularityMin,
        orchestrationId: args.orchestrationId,
        phaseNumber: args.phaseNumber,
        spanCount: args.spanCount,
        errorCount: args.errorCount,
        eventCount: args.eventCount,
        p95DurationMs: args.p95DurationMs,
        maxDurationMs: args.maxDurationMs,
      });
      return existing._id;
    }

    return await ctx.db.insert("telemetryRollups", args);
  },
});

export const listSpans = query({
  args: {
    traceId: v.optional(v.string()),
    orchestrationId: v.optional(v.id("orchestrations")),
    source: v.optional(v.string()),
    operation: v.optional(v.string()),
    since: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageLimit = args.limit ?? 100;

    // Choose the most selective index based on provided filters
    if (args.traceId) {
      let q = ctx.db
        .query("telemetrySpans")
        .withIndex("by_trace_time", (q) => {
          const base = q.eq("traceId", args.traceId!);
          if (args.since) {
            return base.gt("recordedAt", args.since);
          }
          return base;
        })
        .order("asc");

      const spans = await q.take(pageLimit);

      // Post-query filtering for optional params
      let filtered = spans;
      if (args.source) {
        filtered = filtered.filter((s) => s.source === args.source);
      }
      if (args.operation) {
        filtered = filtered.filter((s) => s.operation === args.operation);
      }

      return filtered;
    }

    if (args.orchestrationId) {
      let q = ctx.db
        .query("telemetrySpans")
        .withIndex("by_orchestration_time", (q) => {
          const base = q.eq("orchestrationId", args.orchestrationId!);
          if (args.since) {
            return base.gt("recordedAt", args.since);
          }
          return base;
        })
        .order("asc");

      const spans = await q.take(pageLimit);

      // Post-query filtering
      let filtered = spans;
      if (args.source) {
        filtered = filtered.filter((s) => s.source === args.source);
      }
      if (args.operation) {
        filtered = filtered.filter((s) => s.operation === args.operation);
      }

      return filtered;
    }

    if (args.source) {
      let q = ctx.db
        .query("telemetrySpans")
        .withIndex("by_source_time", (q) => {
          const base = q.eq("source", args.source!);
          if (args.since) {
            return base.gt("recordedAt", args.since);
          }
          return base;
        })
        .order("asc");

      const spans = await q.take(pageLimit);

      // Post-query filtering
      let filtered = spans;
      if (args.operation) {
        filtered = filtered.filter((s) => s.operation === args.operation);
      }

      return filtered;
    }

    if (args.operation) {
      let q = ctx.db
        .query("telemetrySpans")
        .withIndex("by_operation_time", (q) => {
          const base = q.eq("operation", args.operation!);
          if (args.since) {
            return base.gt("recordedAt", args.since);
          }
          return base;
        })
        .order("asc");

      return await q.take(pageLimit);
    }

    // No filters - not recommended for production but needed for tests
    return await ctx.db.query("telemetrySpans").order("asc").take(pageLimit);
  },
});

export const listEvents = query({
  args: {
    traceId: v.optional(v.string()),
    orchestrationId: v.optional(v.id("orchestrations")),
    eventType: v.optional(v.string()),
    source: v.optional(v.string()),
    since: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageLimit = args.limit ?? 100;

    // Choose the most selective index based on provided filters
    if (args.traceId) {
      let q = ctx.db
        .query("telemetryEvents")
        .withIndex("by_trace_time", (q) => {
          const base = q.eq("traceId", args.traceId!);
          if (args.since) {
            return base.gt("recordedAt", args.since);
          }
          return base;
        })
        .order("asc");

      const events = await q.take(pageLimit);

      // Post-query filtering
      let filtered = events;
      if (args.eventType) {
        filtered = filtered.filter((e) => e.eventType === args.eventType);
      }
      if (args.source) {
        filtered = filtered.filter((e) => e.source === args.source);
      }

      return filtered;
    }

    if (args.orchestrationId) {
      let q = ctx.db
        .query("telemetryEvents")
        .withIndex("by_orchestration_time", (q) => {
          const base = q.eq("orchestrationId", args.orchestrationId!);
          if (args.since) {
            return base.gt("recordedAt", args.since);
          }
          return base;
        })
        .order("asc");

      const events = await q.take(pageLimit);

      // Post-query filtering
      let filtered = events;
      if (args.eventType) {
        filtered = filtered.filter((e) => e.eventType === args.eventType);
      }
      if (args.source) {
        filtered = filtered.filter((e) => e.source === args.source);
      }

      return filtered;
    }

    if (args.eventType) {
      let q = ctx.db
        .query("telemetryEvents")
        .withIndex("by_event_type_time", (q) => {
          const base = q.eq("eventType", args.eventType!);
          if (args.since) {
            return base.gt("recordedAt", args.since);
          }
          return base;
        })
        .order("asc");

      const events = await q.take(pageLimit);

      // Post-query filtering
      let filtered = events;
      if (args.source) {
        filtered = filtered.filter((e) => e.source === args.source);
      }

      return filtered;
    }

    if (args.source) {
      let q = ctx.db
        .query("telemetryEvents")
        .withIndex("by_source_time", (q) => {
          const base = q.eq("source", args.source!);
          if (args.since) {
            return base.gt("recordedAt", args.since);
          }
          return base;
        })
        .order("asc");

      return await q.take(pageLimit);
    }

    // No filters - not recommended for production but needed for tests
    return await ctx.db.query("telemetryEvents").order("asc").take(pageLimit);
  },
});

export const getRollups = query({
  args: {
    windowStart: v.string(),
    windowEnd: v.string(),
    source: v.optional(v.string()),
    operation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Query by window range
    if (args.source) {
      const rollups = await ctx.db
        .query("telemetryRollups")
        .withIndex("by_window_source", (q) =>
          q.eq("windowStart", args.windowStart).eq("source", args.source!)
        )
        .filter((q) => q.lte(q.field("windowEnd"), args.windowEnd))
        .collect();

      if (args.operation) {
        return rollups.filter((r) => r.operation === args.operation);
      }

      return rollups;
    }

    if (args.operation) {
      return await ctx.db
        .query("telemetryRollups")
        .withIndex("by_window_operation", (q) =>
          q.eq("windowStart", args.windowStart).eq("operation", args.operation!)
        )
        .filter((q) => q.lte(q.field("windowEnd"), args.windowEnd))
        .collect();
    }

    // No source or operation filter
    return await ctx.db
      .query("telemetryRollups")
      .filter(
        (q) =>
          q.and(
            q.eq(q.field("windowStart"), args.windowStart),
            q.lte(q.field("windowEnd"), args.windowEnd)
          )
      )
      .collect();
  },
});
