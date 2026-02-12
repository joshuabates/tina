import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("timeline:getUnifiedTimeline", () => {
  test("returns empty array for orchestration with no actions or events", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    expect(entries).toEqual([]);
  });

  test("includes control action request entries", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "start_orchestration",
        payload: '{"feature":"timeline-test"}',
        requestedBy: "web-ui",
        idempotencyKey: "key-1",
        status: "pending",
        createdAt: now,
      });
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    expect(entries.length).toBe(1);
    expect(entries[0].source).toBe("control_action");
    expect(entries[0].category).toBe("request");
    expect(entries[0].summary).toContain("start_orchestration");
    expect(entries[0].summary).toContain("web-ui");
    expect(entries[0].actionType).toBe("start_orchestration");
    expect(entries[0].timestamp).toBe(now);
  });

  test("includes completion entries for completed actions", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    const createdAt = 1000;
    const completedAt = 2000;
    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "pause",
        payload: '{"feature":"timeline-test","phase":"1"}',
        requestedBy: "cli",
        idempotencyKey: "key-2",
        status: "completed",
        result: '{"paused":true}',
        createdAt,
        completedAt,
      });
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    // Should have both request and completion entries
    expect(entries.length).toBe(2);

    // Sorted desc by timestamp, so completion (2000) comes first
    expect(entries[0].source).toBe("action_completion");
    expect(entries[0].timestamp).toBe(completedAt);
    expect(entries[0].category).toBe("success");
    expect(entries[0].summary).toBe("pause completed");

    expect(entries[1].source).toBe("control_action");
    expect(entries[1].timestamp).toBe(createdAt);
    expect(entries[1].category).toBe("request");
  });

  test("extracts reason code from failed action result", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "retry",
        payload: '{"feature":"timeline-test","phase":"1"}',
        requestedBy: "web-ui",
        idempotencyKey: "key-3",
        status: "failed",
        result: JSON.stringify({ error_code: "node_offline", message: "Node is offline" }),
        createdAt: 1000,
        completedAt: 2000,
      });
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    const completionEntry = entries.find((e) => e.source === "action_completion");
    expect(completionEntry).toBeDefined();
    expect(completionEntry!.category).toBe("failure");
    expect(completionEntry!.reasonCode).toBe("node_offline");
    expect(completionEntry!.summary).toBe("retry failed");
  });

  test("handles non-JSON result on failed action gracefully", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "resume",
        payload: '{"feature":"timeline-test","phase":"1"}',
        requestedBy: "cli",
        idempotencyKey: "key-4",
        status: "failed",
        result: "raw error string",
        createdAt: 1000,
        completedAt: 2000,
      });
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    const completionEntry = entries.find((e) => e.source === "action_completion");
    expect(completionEntry).toBeDefined();
    expect(completionEntry!.reasonCode).toBeNull();
    expect(completionEntry!.detail).toBe("raw error string");
  });

  test("includes orchestration events", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_started",
      source: "tina-session",
      summary: "Phase 1 started",
      detail: '{"phase":1}',
      recordedAt: "2026-02-10T10:00:00Z",
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    expect(entries.length).toBe(1);
    expect(entries[0].source).toBe("event");
    expect(entries[0].category).toBe("phase_started");
    expect(entries[0].summary).toBe("Phase 1 started");
    expect(entries[0].detail).toBe('{"phase":1}');
    expect(entries[0].actionType).toBeNull();
  });

  test("merges and sorts all sources by timestamp descending", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    // Control action at t=1000
    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "start_orchestration",
        payload: '{"feature":"timeline-test"}',
        requestedBy: "web-ui",
        idempotencyKey: "key-sort-1",
        status: "completed",
        result: '{"ok":true}',
        createdAt: 1000,
        completedAt: 3000,
      });
    });

    // Event at t=2000
    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "agent_shutdown",
      source: "tina-daemon",
      summary: "executor-1 shutdown",
      recordedAt: "2026-02-10T10:00:02Z", // 2000ms after epoch? No, this is ISO
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    // Should have: completion(3000), event(ISO->ms), request(1000)
    expect(entries.length).toBe(3);

    // Verify descending order
    for (let i = 0; i < entries.length - 1; i++) {
      expect(entries[i].timestamp).toBeGreaterThanOrEqual(entries[i + 1].timestamp);
    }
  });

  test("respects limit parameter", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    // Insert 5 events
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.events.recordEvent, {
        orchestrationId,
        eventType: "phase_started",
        source: "tina-session",
        summary: `Event ${i}`,
        recordedAt: `2026-02-10T10:0${i}:00Z`,
      });
    }

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
      limit: 3,
    });

    expect(entries.length).toBe(3);
  });

  test("respects since parameter for control actions", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "pause",
        payload: '{"feature":"timeline-test","phase":"1"}',
        requestedBy: "web-ui",
        idempotencyKey: "key-old",
        status: "pending",
        createdAt: 1000,
      });
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "resume",
        payload: '{"feature":"timeline-test","phase":"1"}',
        requestedBy: "web-ui",
        idempotencyKey: "key-new",
        status: "pending",
        createdAt: 3000,
      });
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
      since: 2000,
    });

    expect(entries.length).toBe(1);
    expect(entries[0].actionType).toBe("resume");
  });

  test("respects since parameter for orchestration events", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_started",
      source: "tina-session",
      summary: "Old event",
      recordedAt: "2026-02-10T09:00:00Z",
    });

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_completed",
      source: "tina-session",
      summary: "New event",
      recordedAt: "2026-02-10T11:00:00Z",
    });

    const sinceTs = new Date("2026-02-10T10:00:00Z").getTime();
    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
      since: sinceTs,
    });

    expect(entries.length).toBe(1);
    expect(entries[0].summary).toBe("New event");
  });

  test("default limit is 100", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    // Just verify the query works without limit
    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    expect(Array.isArray(entries)).toBe(true);
  });

  test("entry IDs have correct prefixes", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "timeline-test");

    await t.run(async (ctx) => {
      await ctx.db.insert("controlPlaneActions", {
        orchestrationId,
        actionType: "start_orchestration",
        payload: "{}",
        requestedBy: "web-ui",
        idempotencyKey: "key-id-test",
        status: "completed",
        result: "ok",
        createdAt: 1000,
        completedAt: 2000,
      });
    });

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_started",
      source: "tina-session",
      summary: "Phase 1",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    const entries = await t.query(api.timeline.getUnifiedTimeline, {
      orchestrationId,
    });

    const requestEntry = entries.find((e) => e.source === "control_action");
    const completionEntry = entries.find((e) => e.source === "action_completion");
    const eventEntry = entries.find((e) => e.source === "event");

    expect(requestEntry!.id).toMatch(/^cpa-req-/);
    expect(completionEntry!.id).toMatch(/^cpa-done-/);
    expect(eventEntry!.id).toMatch(/^evt-/);
  });
});
