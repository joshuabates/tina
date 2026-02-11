import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

describe("telemetry:recordSpan", () => {
  test("creates span with full correlation envelope", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const spanId = await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-123",
      spanId: "span-456",
      orchestrationId,
      featureName: "auth-feature",
      phaseNumber: "1",
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:00:00Z",
      endedAt: "2026-02-10T10:00:05Z",
      durationMs: 5000,
      status: "ok",
      recordedAt: "2026-02-10T10:00:05Z",
    });

    expect(spanId).toBeTruthy();

    const spans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-123",
    });

    expect(spans.length).toBe(1);
    expect(spans[0].operation).toBe("orchestrate.advance");
    expect(spans[0].durationMs).toBe(5000);
    expect(spans[0].status).toBe("ok");
  });

  test("deduplicates spans by spanId", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const spanId1 = await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-123",
      spanId: "span-duplicate",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.next",
      startedAt: "2026-02-10T10:00:00Z",
      status: "open",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    // Same spanId, should return existing ID
    const spanId2 = await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-123",
      spanId: "span-duplicate",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.next",
      startedAt: "2026-02-10T10:00:00Z",
      endedAt: "2026-02-10T10:00:10Z",
      durationMs: 10000,
      status: "ok",
      recordedAt: "2026-02-10T10:00:10Z",
    });

    expect(spanId1).toBe(spanId2);

    const spans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-123",
    });

    // Should only have one span despite two mutations
    expect(spans.length).toBe(1);
  });

  test("records span with parent relationship", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-123",
      spanId: "parent-span",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:00:00Z",
      status: "open",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-123",
      spanId: "child-span",
      parentSpanId: "parent-span",
      orchestrationId,
      source: "tina-daemon",
      operation: "daemon.sync_tasks",
      startedAt: "2026-02-10T10:00:01Z",
      endedAt: "2026-02-10T10:00:03Z",
      durationMs: 2000,
      status: "ok",
      recordedAt: "2026-02-10T10:00:03Z",
    });

    const spans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-123",
    });

    const childSpan = spans.find((s) => s.spanId === "child-span");
    expect(childSpan?.parentSpanId).toBe("parent-span");
  });

  test("records span with error status and details", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-123",
      spanId: "error-span",
      orchestrationId,
      source: "tina-daemon",
      operation: "daemon.sync_commits",
      startedAt: "2026-02-10T10:00:00Z",
      endedAt: "2026-02-10T10:00:01Z",
      durationMs: 1000,
      status: "error",
      errorCode: "git_error",
      errorDetail: "Failed to read git refs",
      recordedAt: "2026-02-10T10:00:01Z",
    });

    const spans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-123",
    });

    const errorSpan = spans[0];
    expect(errorSpan.status).toBe("error");
    expect(errorSpan.errorCode).toBe("git_error");
    expect(errorSpan.errorDetail).toBe("Failed to read git refs");
  });

  test("records span with JSON attrs", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const attrs = JSON.stringify({ retry_count: 1, can_retry: true });

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-123",
      spanId: "span-with-attrs",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:00:00Z",
      status: "open",
      attrs,
      recordedAt: "2026-02-10T10:00:00Z",
    });

    const spans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-123",
    });

    const span = spans[0];
    expect(span.attrs).toBe(attrs);
    const parsed = JSON.parse(span.attrs!);
    expect(parsed.retry_count).toBe(1);
    expect(parsed.can_retry).toBe(true);
  });
});

describe("telemetry:recordEvent", () => {
  test("creates event with correlation envelope", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const eventId = await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-123",
      spanId: "span-456",
      orchestrationId,
      featureName: "auth-feature",
      phaseNumber: "1",
      source: "tina-session",
      eventType: "state.transition",
      severity: "info",
      message: "Transitioning to Executing",
      status: "ok",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    expect(eventId).toBeTruthy();

    const events = await t.query(api.telemetry.listEvents, {
      traceId: "trace-123",
    });

    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe("state.transition");
    expect(events[0].severity).toBe("info");
    expect(events[0].message).toBe("Transitioning to Executing");
  });

  test("creates multiple events without deduplication", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-123",
      spanId: "span-456",
      orchestrationId,
      source: "tina-daemon",
      eventType: "projection.write",
      severity: "debug",
      message: "Wrote task event",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-123",
      spanId: "span-456",
      orchestrationId,
      source: "tina-daemon",
      eventType: "projection.write",
      severity: "debug",
      message: "Wrote task event",
      recordedAt: "2026-02-10T10:00:01Z",
    });

    const events = await t.query(api.telemetry.listEvents, {
      traceId: "trace-123",
    });

    // Should have both events (no dedup)
    expect(events.length).toBe(2);
  });

  test("records projection.skip event with reason in attrs", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const attrs = JSON.stringify({ reason: "task_dir_missing", path: "/path/to/tasks" });

    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-123",
      spanId: "span-789",
      orchestrationId,
      source: "tina-daemon",
      eventType: "projection.skip",
      severity: "warn",
      message: "Skipped task sync: task_dir_missing",
      attrs,
      recordedAt: "2026-02-10T10:00:00Z",
    });

    const events = await t.query(api.telemetry.listEvents, {
      traceId: "trace-123",
    });

    const skipEvent = events[0];
    expect(skipEvent.eventType).toBe("projection.skip");
    const parsed = JSON.parse(skipEvent.attrs!);
    expect(parsed.reason).toBe("task_dir_missing");
  });

  test("records consistency.violation event from harness", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const attrs = JSON.stringify({
      expected: "has_orchestration",
      actual: "not_found",
      feature: "auth-feature",
    });

    await t.mutation(api.telemetry.recordEvent, {
      traceId: "harness-trace-123",
      spanId: "verify-span",
      orchestrationId,
      source: "tina-harness",
      eventType: "consistency.violation",
      severity: "error",
      message: "Orchestration not found in Convex",
      status: "error",
      attrs,
      recordedAt: "2026-02-10T10:00:00Z",
    });

    const events = await t.query(api.telemetry.listEvents, {
      traceId: "harness-trace-123",
    });

    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe("consistency.violation");
    expect(events[0].severity).toBe("error");
  });
});

describe("telemetry:listSpans", () => {
  test("filters spans by traceId", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-1",
      spanId: "span-1",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.next",
      startedAt: "2026-02-10T10:00:00Z",
      status: "ok",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-2",
      spanId: "span-2",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:00:00Z",
      status: "ok",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    const trace1Spans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-1",
    });

    expect(trace1Spans.length).toBe(1);
    expect(trace1Spans[0].traceId).toBe("trace-1");
  });

  test("filters spans by orchestrationId", async () => {
    const t = convexTest(schema);
    const { orchestrationId: orch1 } = await createFeatureFixture(t, "feature-1");
    const { orchestrationId: orch2 } = await createFeatureFixture(t, "feature-2");

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-1",
      spanId: "span-1",
      orchestrationId: orch1,
      source: "tina-session",
      operation: "orchestrate.next",
      startedAt: "2026-02-10T10:00:00Z",
      status: "ok",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-2",
      spanId: "span-2",
      orchestrationId: orch2,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T10:00:00Z",
      status: "ok",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    const orch1Spans = await t.query(api.telemetry.listSpans, {
      orchestrationId: orch1,
    });

    expect(orch1Spans.length).toBe(1);
    expect(orch1Spans[0].orchestrationId).toBe(orch1);
  });

  test("filters spans by source", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-1",
      spanId: "span-1",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.next",
      startedAt: "2026-02-10T10:00:00Z",
      status: "ok",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-1",
      spanId: "span-2",
      orchestrationId,
      source: "tina-daemon",
      operation: "daemon.sync_all",
      startedAt: "2026-02-10T10:00:01Z",
      status: "ok",
      recordedAt: "2026-02-10T10:00:01Z",
    });

    const daemonSpans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-1",
      source: "tina-daemon",
    });

    expect(daemonSpans.length).toBe(1);
    expect(daemonSpans[0].source).toBe("tina-daemon");
  });

  test("filters spans by time range (since)", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-1",
      spanId: "span-old",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.next",
      startedAt: "2026-02-10T09:00:00Z",
      status: "ok",
      recordedAt: "2026-02-10T09:00:00Z",
    });

    await t.mutation(api.telemetry.recordSpan, {
      traceId: "trace-1",
      spanId: "span-new",
      orchestrationId,
      source: "tina-session",
      operation: "orchestrate.advance",
      startedAt: "2026-02-10T11:00:00Z",
      status: "ok",
      recordedAt: "2026-02-10T11:00:00Z",
    });

    const recentSpans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-1",
      since: "2026-02-10T10:00:00Z",
    });

    expect(recentSpans.length).toBe(1);
    expect(recentSpans[0].spanId).toBe("span-new");
  });

  test("respects limit parameter", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    for (let i = 0; i < 5; i++) {
      await t.mutation(api.telemetry.recordSpan, {
        traceId: "trace-1",
        spanId: `span-${i}`,
        orchestrationId,
        source: "tina-session",
        operation: "orchestrate.next",
        startedAt: `2026-02-10T10:00:0${i}Z`,
        status: "ok",
        recordedAt: `2026-02-10T10:00:0${i}Z`,
      });
    }

    const limitedSpans = await t.query(api.telemetry.listSpans, {
      traceId: "trace-1",
      limit: 3,
    });

    expect(limitedSpans.length).toBe(3);
  });
});

describe("telemetry:listEvents", () => {
  test("filters events by traceId", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-1",
      spanId: "span-1",
      orchestrationId,
      source: "tina-session",
      eventType: "state.transition",
      severity: "info",
      message: "Transition 1",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-2",
      spanId: "span-2",
      orchestrationId,
      source: "tina-session",
      eventType: "state.transition",
      severity: "info",
      message: "Transition 2",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    const trace1Events = await t.query(api.telemetry.listEvents, {
      traceId: "trace-1",
    });

    expect(trace1Events.length).toBe(1);
    expect(trace1Events[0].traceId).toBe("trace-1");
  });

  test("filters events by eventType", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-1",
      spanId: "span-1",
      orchestrationId,
      source: "tina-daemon",
      eventType: "projection.write",
      severity: "debug",
      message: "Wrote task",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.telemetry.recordEvent, {
      traceId: "trace-1",
      spanId: "span-1",
      orchestrationId,
      source: "tina-daemon",
      eventType: "projection.skip",
      severity: "warn",
      message: "Skipped task",
      recordedAt: "2026-02-10T10:00:01Z",
    });

    const skipEvents = await t.query(api.telemetry.listEvents, {
      traceId: "trace-1",
      eventType: "projection.skip",
    });

    expect(skipEvents.length).toBe(1);
    expect(skipEvents[0].eventType).toBe("projection.skip");
  });
});

describe("telemetry:recordRollup", () => {
  test("creates rollup with metrics", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const rollupId = await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
      source: "tina-session",
      operation: "orchestrate.advance",
      orchestrationId,
      spanCount: 42,
      errorCount: 3,
      eventCount: 105,
      p95DurationMs: 2500,
      maxDurationMs: 5000,
    });

    expect(rollupId).toBeTruthy();

    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
    });

    expect(rollups.length).toBe(1);
    expect(rollups[0].spanCount).toBe(42);
    expect(rollups[0].p95DurationMs).toBe(2500);
  });

  test("upserts rollup by window+source+operation", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const rollupId1 = await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
      source: "tina-session",
      operation: "orchestrate.advance",
      spanCount: 10,
      errorCount: 0,
      eventCount: 20,
    });

    // Same window+source+operation, should update
    const rollupId2 = await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
      source: "tina-session",
      operation: "orchestrate.advance",
      spanCount: 15,
      errorCount: 1,
      eventCount: 25,
      p95DurationMs: 3000,
    });

    expect(rollupId1).toBe(rollupId2);

    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
    });

    // Should only have one rollup with updated values
    expect(rollups.length).toBe(1);
    expect(rollups[0].spanCount).toBe(15);
    expect(rollups[0].errorCount).toBe(1);
    expect(rollups[0].p95DurationMs).toBe(3000);
  });
});

describe("telemetry:getRollups", () => {
  test("filters rollups by window range", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2026-02-10T09:00:00Z",
      windowEnd: "2026-02-10T09:15:00Z",
      granularityMin: 15,
      source: "tina-session",
      operation: "orchestrate.advance",
      spanCount: 10,
      errorCount: 0,
      eventCount: 20,
    });

    await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
      source: "tina-session",
      operation: "orchestrate.advance",
      spanCount: 15,
      errorCount: 1,
      eventCount: 25,
    });

    const rollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
    });

    expect(rollups.length).toBe(1);
    expect(rollups[0].windowStart).toBe("2026-02-10T10:00:00Z");
  });

  test("filters rollups by source", async () => {
    const t = convexTest(schema);

    await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
      source: "tina-session",
      operation: "orchestrate.advance",
      spanCount: 10,
      errorCount: 0,
      eventCount: 20,
    });

    await t.mutation(api.telemetry.recordRollup, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      granularityMin: 15,
      source: "tina-daemon",
      operation: "daemon.sync_all",
      spanCount: 5,
      errorCount: 0,
      eventCount: 10,
    });

    const daemonRollups = await t.query(api.telemetry.getRollups, {
      windowStart: "2026-02-10T10:00:00Z",
      windowEnd: "2026-02-10T10:15:00Z",
      source: "tina-daemon",
    });

    expect(daemonRollups.length).toBe(1);
    expect(daemonRollups[0].source).toBe("tina-daemon");
  });
});
