import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
import { createFeatureFixture } from "./test_helpers";

describe("events:recordEvent", () => {
  test("creates agent_shutdown event with correct structure", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const detail = {
      agent_name: "executor-3",
      agent_type: "tina:phase-executor",
      shutdown_detected_at: "2026-02-10T20:30:00Z",
    };

    const eventId = await t.mutation(api.events.recordEvent, {
      orchestrationId,
      phaseNumber: "1",
      eventType: "agent_shutdown",
      source: "tina-daemon",
      summary: "executor-3 shutdown",
      detail: JSON.stringify(detail),
      recordedAt: "2026-02-10T20:30:05Z",
    });

    expect(eventId).toBeTruthy();

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
    });

    const shutdownEvent = events.find((e) => e._id === eventId);
    expect(shutdownEvent).toBeDefined();
    expect(shutdownEvent!.eventType).toBe("agent_shutdown");
    expect(shutdownEvent!.summary).toBe("executor-3 shutdown");
    expect(shutdownEvent!.detail).toBe(JSON.stringify(detail));
  });

  test("stores agent_name, agent_type in detail JSON", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const detail = {
      agent_name: "executor-1",
      agent_type: "tina:phase-executor",
      shutdown_detected_at: "2026-02-10T21:00:00Z",
    };

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      phaseNumber: "2",
      eventType: "agent_shutdown",
      source: "tina-daemon",
      summary: "executor-1 shutdown",
      detail: JSON.stringify(detail),
      recordedAt: "2026-02-10T21:00:05Z",
    });

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
    });

    const shutdownEvent = events.find((e) => e.eventType === "agent_shutdown");
    expect(shutdownEvent).toBeDefined();

    const parsedDetail = JSON.parse(shutdownEvent!.detail!);
    expect(parsedDetail.agent_name).toBe("executor-1");
    expect(parsedDetail.agent_type).toBe("tina:phase-executor");
  });

  test("includes shutdown_detected_at timestamp in detail", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const detail = {
      agent_name: "executor-2",
      agent_type: "tina:phase-executor",
      shutdown_detected_at: "2026-02-10T22:00:00Z",
    };

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      phaseNumber: "3",
      eventType: "agent_shutdown",
      source: "tina-daemon",
      summary: "executor-2 shutdown",
      detail: JSON.stringify(detail),
      recordedAt: "2026-02-10T22:00:05Z",
    });

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
    });

    const shutdownEvent = events.find((e) => e.eventType === "agent_shutdown");
    const parsedDetail = JSON.parse(shutdownEvent!.detail!);
    expect(parsedDetail.shutdown_detected_at).toBe("2026-02-10T22:00:00Z");
  });
});

describe("events:listEvents", () => {
  test("query events by eventType:agent_shutdown returns only shutdown events", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_started",
      source: "tina-session",
      summary: "Phase 1 started",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "agent_shutdown",
      source: "tina-daemon",
      summary: "executor-1 shutdown",
      detail: JSON.stringify({
        agent_name: "executor-1",
        agent_type: "tina:phase-executor",
        shutdown_detected_at: "2026-02-10T11:00:00Z",
      }),
      recordedAt: "2026-02-10T11:00:05Z",
    });

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_completed",
      source: "tina-session",
      summary: "Phase 1 completed",
      recordedAt: "2026-02-10T12:00:00Z",
    });

    const allEvents = await t.query(api.events.listEvents, {
      orchestrationId,
    });

    const shutdownEvents = allEvents.filter(
      (e) => e.eventType === "agent_shutdown"
    );

    expect(shutdownEvents.length).toBe(1);
    expect(shutdownEvents[0].summary).toBe("executor-1 shutdown");
  });

  test("shutdown events appear in orchestration event timeline", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_started",
      source: "tina-session",
      summary: "Phase 1 started",
      recordedAt: "2026-02-10T10:00:00Z",
    });

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "agent_shutdown",
      source: "tina-daemon",
      summary: "executor-1 shutdown",
      detail: JSON.stringify({
        agent_name: "executor-1",
        agent_type: "tina:phase-executor",
        shutdown_detected_at: "2026-02-10T11:00:00Z",
      }),
      recordedAt: "2026-02-10T11:00:05Z",
    });

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
    });

    expect(events.length).toBe(2);
    expect(events[1].eventType).toBe("agent_shutdown");
    expect(events[0].recordedAt < events[1].recordedAt).toBe(true);
  });
});

describe("events:recordEvent - detail JSON parsing", () => {
  test("event detail JSON parses without errors", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const detail = {
      agent_name: "executor-5",
      agent_type: "tina:phase-executor",
      shutdown_detected_at: "2026-02-10T23:00:00Z",
      extra_field: "extra_value",
    };

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "agent_shutdown",
      source: "tina-daemon",
      summary: "executor-5 shutdown",
      detail: JSON.stringify(detail),
      recordedAt: "2026-02-10T23:00:05Z",
    });

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
    });

    const shutdownEvent = events.find((e) => e.eventType === "agent_shutdown");

    expect(() => JSON.parse(shutdownEvent!.detail!)).not.toThrow();

    const parsedDetail = JSON.parse(shutdownEvent!.detail!);
    expect(parsedDetail.agent_name).toBe("executor-5");
    expect(parsedDetail.extra_field).toBe("extra_value");
  });
});
