import { describe, expect, it, vi } from "vitest";
import { deduplicateTaskEvents, loadTaskEventsForOrchestration } from "./tasks";

describe("deduplicateTaskEvents", () => {
  it("keeps the latest event per task and phase scope", () => {
    const events = [
      { taskId: "1", phaseNumber: "1", recordedAt: "2026-02-10T10:00:00Z" },
      { taskId: "1", phaseNumber: "1", recordedAt: "2026-02-10T11:00:00Z" },
      { taskId: "1", phaseNumber: "2", recordedAt: "2026-02-10T10:30:00Z" },
      { taskId: "1", recordedAt: "2026-02-10T09:30:00Z" },
      { taskId: "1", recordedAt: "2026-02-10T12:30:00Z" },
    ];

    const deduped = deduplicateTaskEvents(events);

    expect(deduped).toHaveLength(3);
    expect(
      deduped.find((event) => event.phaseNumber === "1")?.recordedAt,
    ).toBe("2026-02-10T11:00:00Z");
    expect(
      deduped.find((event) => event.phaseNumber === "2")?.recordedAt,
    ).toBe("2026-02-10T10:30:00Z");
    expect(
      deduped.find((event) => event.phaseNumber === undefined)?.recordedAt,
    ).toBe("2026-02-10T12:30:00Z");
  });
});

describe("loadTaskEventsForOrchestration", () => {
  it("loads a bounded recent event slice for an orchestration", async () => {
    const first = { _id: "evt-1" };
    const second = { _id: "evt-2" };
    const third = { _id: "evt-3" };

    const take = vi.fn().mockResolvedValue([first, second, third]);

    const orderedQuery: any = {
      order: vi.fn(),
      take,
    };
    orderedQuery.order.mockReturnValue(orderedQuery);

    const indexedQuery: any = {
      withIndex: vi.fn(),
    };
    indexedQuery.withIndex.mockReturnValue(orderedQuery);

    const ctx: any = {
      db: {
        query: vi.fn().mockReturnValue(indexedQuery),
      },
    };

    const events = await loadTaskEventsForOrchestration(ctx, "orch-1" as any);

    expect(events).toEqual([first, second, third]);
    expect(ctx.db.query).toHaveBeenCalledWith("taskEvents");
    expect(ctx.db.query).toHaveBeenCalledTimes(1);
    expect(indexedQuery.withIndex).toHaveBeenCalled();
    expect(orderedQuery.order).toHaveBeenCalledWith("desc");
    expect(take).toHaveBeenCalledWith(1000);
  });
});
