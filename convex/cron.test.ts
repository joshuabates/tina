import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

describe("cron:cleanupExpiredTelemetry", () => {
  test("deletes success spans older than 7 days", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create old success span (8 days ago)
    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-old",
      spanId: "span-old",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-02T10:00:00Z",
      endedAt: "2026-02-02T10:00:05Z",
      durationMs: 5000,
      status: "ok",
      recordedAt: "2026-02-02T10:00:05Z",
    });

    // Create recent success span (3 days ago)
    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-recent",
      spanId: "span-recent",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-07T10:00:00Z",
      endedAt: "2026-02-07T10:00:05Z",
      durationMs: 5000,
      status: "ok",
      recordedAt: "2026-02-07T10:00:05Z",
    });

    // Run cleanup with current time = 2026-02-10T10:00:00Z
    const result = await t.mutation(internal.cron.cleanupExpiredTelemetry, {
      currentTime: "2026-02-10T10:00:00Z",
    });

    expect(result.deletedSpans).toBe(1);
    expect(result.deletedEvents).toBe(0);

    // Verify old span deleted, recent kept
    const spans = await t.query(api.telemetry.listSpans, {});
    expect(spans.length).toBe(1);
    expect(spans[0].spanId).toBe("span-recent");
  });

  test("deletes error spans older than 30 days", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create old error span (35 days ago)
    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-old-error",
      spanId: "span-old-error",
      orchestrationId,
      source: "tina-daemon",
      operation: "daemon.sync_tasks",
      startedAt: "2026-01-06T10:00:00Z",
      endedAt: "2026-01-06T10:00:01Z",
      durationMs: 1000,
      status: "error",
      errorCode: "sync_failed",
      recordedAt: "2026-01-06T10:00:01Z",
    });

    // Create recent error span (10 days ago)
    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-recent-error",
      spanId: "span-recent-error",
      orchestrationId,
      source: "tina-daemon",
      operation: "daemon.sync_tasks",
      startedAt: "2026-01-31T10:00:00Z",
      endedAt: "2026-01-31T10:00:01Z",
      durationMs: 1000,
      status: "error",
      errorCode: "sync_failed",
      recordedAt: "2026-01-31T10:00:01Z",
    });

    // Run cleanup with current time = 2026-02-10T10:00:00Z
    const result = await t.mutation(internal.cron.cleanupExpiredTelemetry, {
      currentTime: "2026-02-10T10:00:00Z",
    });

    expect(result.deletedSpans).toBe(1);

    // Verify old error span deleted, recent error kept
    const spans = await t.query(api.telemetry.listSpans, {});
    expect(spans.length).toBe(1);
    expect(spans[0].spanId).toBe("span-recent-error");
  });

  test("deletes success events older than 7 days", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create old info event (8 days ago)
    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-old",
      spanId: "span-1",
      orchestrationId,
      source: "tina-session",
      eventType: "state.transition",
      severity: "info",
      message: "Old transition",
      recordedAt: "2026-02-02T10:00:00Z",
    });

    // Create recent info event (3 days ago)
    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-recent",
      spanId: "span-2",
      orchestrationId,
      source: "tina-session",
      eventType: "state.transition",
      severity: "info",
      message: "Recent transition",
      recordedAt: "2026-02-07T10:00:00Z",
    });

    // Run cleanup with current time = 2026-02-10T10:00:00Z
    const result = await t.mutation(internal.cron.cleanupExpiredTelemetry, {
      currentTime: "2026-02-10T10:00:00Z",
    });

    expect(result.deletedEvents).toBe(1);

    // Verify old event deleted, recent kept
    const events = await t.query(api.telemetry.listEvents, {});
    expect(events.length).toBe(1);
    expect(events[0].message).toBe("Recent transition");
  });

  test("deletes error/warn events older than 30 days", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create old error event (35 days ago)
    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-old-error",
      spanId: "span-1",
      orchestrationId,
      source: "tina-daemon",
      eventType: "projection.skip",
      severity: "error",
      message: "Old error",
      recordedAt: "2026-01-06T10:00:00Z",
    });

    // Create old warn event (35 days ago)
    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-old-warn",
      spanId: "span-2",
      orchestrationId,
      source: "tina-daemon",
      eventType: "projection.skip",
      severity: "warn",
      message: "Old warning",
      recordedAt: "2026-01-06T10:00:00Z",
    });

    // Create recent error event (10 days ago)
    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-recent-error",
      spanId: "span-3",
      orchestrationId,
      source: "tina-daemon",
      eventType: "projection.skip",
      severity: "error",
      message: "Recent error",
      recordedAt: "2026-01-31T10:00:00Z",
    });

    // Run cleanup with current time = 2026-02-10T10:00:00Z
    const result = await t.mutation(internal.cron.cleanupExpiredTelemetry, {
      currentTime: "2026-02-10T10:00:00Z",
    });

    expect(result.deletedEvents).toBe(2);

    // Verify old events deleted, recent error kept
    const events = await t.query(api.telemetry.listEvents, {});
    expect(events.length).toBe(1);
    expect(events[0].message).toBe("Recent error");
  });

  test("deletes rollups older than 180 days", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create old rollup (185 days ago)
    await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2025-08-08T10:00:00Z",
      windowEnd: "2025-08-08T10:15:00Z",
      granularityMin: 15,
      source: "tina-session",
      operation: "orchestrate.advance",
      orchestrationId,
      spanCount: 10,
      errorCount: 0,
      eventCount: 20,
    });

    // Create recent rollup (90 days ago)
    await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2025-11-12T10:00:00Z",
      windowEnd: "2025-11-12T10:15:00Z",
      granularityMin: 15,
      source: "tina-session",
      operation: "orchestrate.advance",
      orchestrationId,
      spanCount: 15,
      errorCount: 1,
      eventCount: 25,
    });

    // Run cleanup with current time = 2026-02-10T10:00:00Z
    const result = await t.mutation(internal.cron.cleanupExpiredTelemetry, {
      currentTime: "2026-02-10T10:00:00Z",
    });

    expect(result.deletedRollups).toBe(1);

    // Verify old rollup deleted, recent kept - query by exact window
    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2025-11-12T10:00:00Z",
      windowEnd: "2025-11-12T10:15:00Z",
    });
    expect(rollups.length).toBe(1);
    expect(rollups[0].windowStart).toBe("2025-11-12T10:00:00Z");
  });

  test("handles empty database gracefully", async () => {
    const t = convexTest(schema);

    const result = await t.mutation(internal.cron.cleanupExpiredTelemetry, {
      currentTime: "2026-02-10T10:00:00Z",
    });

    expect(result.deletedSpans).toBe(0);
    expect(result.deletedEvents).toBe(0);
    expect(result.deletedRollups).toBe(0);
  });
});

describe("cron:aggregateSpansIntoRollups", () => {
  test("aggregates spans into 15min rollup with p95 and max metrics", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create 10 spans within a 15-minute window (2026-02-10 10:00:00 - 10:15:00)
    const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    for (let i = 0; i < 10; i++) {
      await t.mutation(api.telemetry.recordSpan, {
        traceId: "trace-1",
        spanId: `span-${i}`,
        orchestrationId,
        source: "tina-session",
        operation: "orchestrate.advance",
        startedAt: `2026-02-10T10:0${i}:00Z`,
        endedAt: `2026-02-10T10:0${i}:00.${durations[i]}Z`,
        durationMs: durations[i],
        status: "ok",
        recordedAt: `2026-02-10T10:0${i}:00Z`,
      });
    }

    // Add 2 error spans in same window
    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-2",
      spanId: "span-error-1",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:10:00Z",
      endedAt: "2026-02-10T10:10:00.500Z",
      durationMs: 500,
      status: "error",
      recordedAt: "2026-02-10T10:10:00Z",
    });

    // Add 5 events in same window
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.telemetry.recordEvent, {
        traceId: "trace-1",
        spanId: `span-${i}`,
        orchestrationId,
        source: "tina-session",
        eventType: "state.transition",
        severity: "info",
        message: `Event ${i}`,
        recordedAt: `2026-02-10T10:0${i}:00Z`,
      });
    }

    // Run rollup for window 10:00:00 - 10:15:00
    const result = await t.mutation(internal.cron.aggregateSpansIntoRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
    });

    expect(result.rollupsCreated).toBeGreaterThan(0);

    // Verify rollup created with correct metrics
    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
    });

    expect(rollups.length).toBe(1);
    const rollup = rollups[0];

    expect(rollup.source).toBe("tina-session");
    expect(rollup.operation).toBe("orchestrate.advance");
    expect(rollup.spanCount).toBe(11); // 10 success + 1 error
    expect(rollup.errorCount).toBe(1);
    expect(rollup.eventCount).toBe(5);
    expect(rollup.granularityMin).toBe(15);

    // p95 of [100,200,300,400,500,600,700,800,900,1000,500] is 950
    expect(rollup.p95DurationMs).toBe(950);
    // max is 1000
    expect(rollup.maxDurationMs).toBe(1000);
  });

  test("aggregates spans into hourly rollup", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create spans across an hour (10:00 - 11:00)
    for (let i = 0; i < 4; i++) {
      await t.mutation(api.telemetry.recordSpan, {
        traceId: "trace-1",
        spanId: `span-${i}`,
        orchestrationId,
        source: "tina-daemon",
        operation: "daemon.sync_all",
        startedAt: `2026-02-10T10:${i * 15}:00Z`,
        endedAt: `2026-02-10T10:${i * 15}:00.500Z`,
        durationMs: 500 + i * 100,
        status: "ok",
        recordedAt: `2026-02-10T10:${i * 15}:00Z`,
      });
    }

    // Run hourly rollup
    const result = await t.mutation(internal.cron.aggregateSpansIntoRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T11:00:00Z",
      granularityMin: 60,
    });

    expect(result.rollupsCreated).toBeGreaterThan(0);

    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T11:00:00Z",
    });

    expect(rollups.length).toBe(1);
    expect(rollups[0].spanCount).toBe(4);
    expect(rollups[0].granularityMin).toBe(60);
  });

  test("aggregates spans into daily rollup", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create spans across a day (00:00 - 24:00)
    for (let i = 0; i < 24; i++) {
      await t.mutation(api.telemetry.recordSpan, {
        traceId: "trace-1",
        spanId: `span-${i}`,
        orchestrationId,
        source: "tina-web",
        operation: "web.query",
        startedAt: `2026-02-10T${String(i).padStart(2, "0")}:00:00Z`,
        endedAt: `2026-02-10T${String(i).padStart(2, "0")}:00:00.100Z`,
        durationMs: 100,
        status: "ok",
        recordedAt: `2026-02-10T${String(i).padStart(2, "0")}:00:00Z`,
      });
    }

    // Run daily rollup (1440 minutes = 24 hours)
    const result = await t.mutation(internal.cron.aggregateSpansIntoRollups, {
      windowStart: "2026-02-10T00:00:00Z",
      windowEnd: "2026-02-11T00:00:00Z",
      granularityMin: 1440,
    });

    expect(result.rollupsCreated).toBeGreaterThan(0);

    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T00:00:00Z",
      windowEnd: "2026-02-11T00:00:00Z",
    });

    expect(rollups.length).toBe(1);
    expect(rollups[0].spanCount).toBe(24);
    expect(rollups[0].granularityMin).toBe(1440);
  });

  test("creates separate rollups per source+operation combination", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create spans for different source+operation combos in same window
    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-1",
      spanId: "span-session-advance",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:00:00Z",
      durationMs: 100,
      status: "ok",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-2",
      spanId: "span-daemon-sync",
      orchestrationId,
      source: "tina-daemon",
      operation: "daemon.sync_all",
      startedAt: "2026-02-10T10:01:00Z",
      durationMs: 200,
      status: "ok",
      recordedAt: "2026-02-10T10:01:00Z",
    });

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-3",
      spanId: "span-web-query",
      orchestrationId,
      source: "tina-web",
      operation: "web.query",
      startedAt: "2026-02-10T10:02:00Z",
      durationMs: 50,
      status: "ok",
      recordedAt: "2026-02-10T10:02:00Z",
    });

    // Run rollup
    const result = await t.mutation(internal.cron.aggregateSpansIntoRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
    });

    expect(result.rollupsCreated).toBe(3);

    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
    });

    expect(rollups.length).toBe(3);

    // Verify each source+operation has its own rollup
    const sessionRollup = rollups.find(
      (r) => r.source === "tina-session" && r.operation === "orchestrate.advance"
    );
    const daemonRollup = rollups.find(
      (r) => r.source === "tina-daemon" && r.operation === "daemon.sync_all"
    );
    const webRollup = rollups.find(
      (r) => r.source === "tina-web" && r.operation === "web.query"
    );

    expect(sessionRollup).toBeDefined();
    expect(daemonRollup).toBeDefined();
    expect(webRollup).toBeDefined();
  });

  test("handles empty window gracefully", async () => {
    const t = convexTest(schema);

    const result = await t.mutation(internal.cron.aggregateSpansIntoRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
    });

    expect(result.rollupsCreated).toBe(0);
  });

  test("updates existing rollup if already exists", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    // Create initial span
    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-1",
      spanId: "span-1",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:00:00Z",
      durationMs: 100,
      status: "ok",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    // Run first rollup
    await t.mutation(internal.cron.aggregateSpansIntoRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
    });

    // Add more spans
    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-2",
      spanId: "span-2",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:05:00Z",
      durationMs: 200,
      status: "ok",
      recordedAt: "2026-02-10T10:05:00Z",
    });

    // Run rollup again
    const result = await t.mutation(internal.cron.aggregateSpansIntoRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
    });

    expect(result.rollupsCreated).toBe(1);

    // Should still only have one rollup, but with updated counts
    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
    });

    expect(rollups.length).toBe(1);
    expect(rollups[0].spanCount).toBe(2);
  });
});
