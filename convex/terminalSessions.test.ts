import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

describe("terminalSessions:upsert", () => {
  test("inserts new terminal session", async () => {
    const t = convexTest(schema, modules);

    const id = await t.mutation(
      "terminalSessions:upsert" as any,
      {
        sessionName: "tina-adhoc-abc123",
        tmuxPaneId: "%412",
        label: "Discuss: Add auth middleware",
        cli: "claude",
        status: "active",
        createdAt: 1707350400000,
      },
    );

    expect(id).toBeTruthy();
  });

  test("upserts existing session by sessionName", async () => {
    const t = convexTest(schema, modules);

    const id1 = await t.mutation(
      "terminalSessions:upsert" as any,
      {
        sessionName: "tina-adhoc-abc123",
        tmuxPaneId: "%412",
        label: "Discuss: Add auth middleware",
        cli: "claude",
        status: "active",
        createdAt: 1707350400000,
      },
    );

    const id2 = await t.mutation(
      "terminalSessions:upsert" as any,
      {
        sessionName: "tina-adhoc-abc123",
        tmuxPaneId: "%413",
        label: "Updated label",
        cli: "claude",
        status: "active",
        createdAt: 1707350400000,
      },
    );

    expect(id2).toBe(id1);

    const session = await t.query(
      "terminalSessions:getBySessionName" as any,
      { sessionName: "tina-adhoc-abc123" },
    );
    expect(session).not.toBeNull();
    expect(session!.tmuxPaneId).toBe("%413");
    expect(session!.label).toBe("Updated label");
  });

  test("stores optional context fields", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      "terminalSessions:upsert" as any,
      {
        sessionName: "tina-adhoc-ctx",
        tmuxPaneId: "%500",
        label: "Review task",
        cli: "claude",
        status: "active",
        contextType: "task",
        contextId: "task-id-123",
        contextSummary: "Review auth implementation",
        createdAt: 1707350400000,
      },
    );

    const session = await t.query(
      "terminalSessions:getBySessionName" as any,
      { sessionName: "tina-adhoc-ctx" },
    );
    expect(session).not.toBeNull();
    expect(session!.contextType).toBe("task");
    expect(session!.contextId).toBe("task-id-123");
    expect(session!.contextSummary).toBe("Review auth implementation");
  });
});

describe("terminalSessions:markEnded", () => {
  test("sets status to ended and endedAt timestamp", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      "terminalSessions:upsert" as any,
      {
        sessionName: "tina-adhoc-end",
        tmuxPaneId: "%414",
        label: "Session to end",
        cli: "claude",
        status: "active",
        createdAt: 1707350400000,
      },
    );

    await t.mutation(
      "terminalSessions:markEnded" as any,
      {
        sessionName: "tina-adhoc-end",
        endedAt: 1707354000000,
      },
    );

    const session = await t.query(
      "terminalSessions:getBySessionName" as any,
      { sessionName: "tina-adhoc-end" },
    );
    expect(session).not.toBeNull();
    expect(session!.status).toBe("ended");
    expect(session!.endedAt).toBe(1707354000000);
  });

  test("throws when session not found", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(
        "terminalSessions:markEnded" as any,
        {
          sessionName: "nonexistent",
          endedAt: 1707354000000,
        },
      ),
    ).rejects.toThrow();
  });
});

describe("terminalSessions:getBySessionName", () => {
  test("returns session when exists", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      "terminalSessions:upsert" as any,
      {
        sessionName: "tina-adhoc-lookup",
        tmuxPaneId: "%415",
        label: "Lookup test",
        cli: "codex",
        status: "active",
        createdAt: 1707350400000,
      },
    );

    const session = await t.query(
      "terminalSessions:getBySessionName" as any,
      { sessionName: "tina-adhoc-lookup" },
    );
    expect(session).not.toBeNull();
    expect(session!.sessionName).toBe("tina-adhoc-lookup");
    expect(session!.cli).toBe("codex");
  });

  test("returns null when session does not exist", async () => {
    const t = convexTest(schema, modules);

    const session = await t.query(
      "terminalSessions:getBySessionName" as any,
      { sessionName: "nonexistent" },
    );
    expect(session).toBeNull();
  });
});

describe("terminalSessions:listActive", () => {
  test("returns only active sessions", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(
      "terminalSessions:upsert" as any,
      {
        sessionName: "tina-adhoc-active1",
        tmuxPaneId: "%416",
        label: "Active session 1",
        cli: "claude",
        status: "active",
        createdAt: 1707350400000,
      },
    );

    await t.mutation(
      "terminalSessions:upsert" as any,
      {
        sessionName: "tina-adhoc-active2",
        tmuxPaneId: "%417",
        label: "Active session 2",
        cli: "claude",
        status: "active",
        createdAt: 1707350401000,
      },
    );

    await t.mutation(
      "terminalSessions:markEnded" as any,
      {
        sessionName: "tina-adhoc-active1",
        endedAt: 1707354000000,
      },
    );

    const active = await t.query(
      "terminalSessions:listActive" as any,
      {},
    );
    expect(active.length).toBe(1);
    expect(active[0].sessionName).toBe("tina-adhoc-active2");
  });

  test("returns empty array when no active sessions", async () => {
    const t = convexTest(schema, modules);

    const active = await t.query(
      "terminalSessions:listActive" as any,
      {},
    );
    expect(active).toEqual([]);
  });
});
