import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "./schema";
import { createFeatureFixture, registerTeam } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("terminalTargets:listTerminalTargets", () => {
  test("returns agents with tmuxPaneId from active orchestrations", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      phaseNumber: "1",
      tmuxSessionName: "tina-auth-feature-phase-1",
      createdAt: Date.now(),
    });

    // Add team member with a pane ID
    await t.mutation("teamMembers:upsertTeamMember" as any, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "worker-1",
      agentType: "general-purpose",
      model: "claude-sonnet-4-5",
      tmuxPaneId: "%42",
      recordedAt: "2026-02-13T10:00:00Z",
    });

    const targets = await t.query(
      "terminalTargets:listTerminalTargets" as any,
      {},
    );

    expect(targets.length).toBe(1);
    expect(targets[0]).toMatchObject({
      label: "worker-1",
      tmuxPaneId: "%42",
      type: "agent",
    });
    expect(targets[0].id).toBeTruthy();
    expect(targets[0].tmuxSessionName).toBeTruthy();
  });

  test("returns only ad-hoc sessions when no agents have pane IDs", async () => {
    const t = convexTest(schema, modules);

    await t.mutation("terminalSessions:upsert" as any, {
      sessionName: "tina-adhoc-abc",
      tmuxPaneId: "%100",
      label: "Debug session",
      cli: "claude",
      status: "active",
      createdAt: Date.now(),
    });

    const targets = await t.query(
      "terminalTargets:listTerminalTargets" as any,
      {},
    );

    expect(targets.length).toBe(1);
    expect(targets[0]).toMatchObject({
      label: "Debug session",
      tmuxPaneId: "%100",
      type: "adhoc",
      cli: "claude",
    });
  });

  test("returns both agents and ad-hoc sessions", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "multi-feature");

    await registerTeam(t, {
      teamName: "multi-feature-phase-1",
      orchestrationId,
      phaseNumber: "1",
      tmuxSessionName: "tina-multi",
      createdAt: Date.now(),
    });

    await t.mutation("teamMembers:upsertTeamMember" as any, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "executor",
      tmuxPaneId: "%50",
      recordedAt: "2026-02-13T10:00:00Z",
    });

    await t.mutation("terminalSessions:upsert" as any, {
      sessionName: "tina-adhoc-xyz",
      tmuxPaneId: "%200",
      label: "Ad-hoc task",
      cli: "codex",
      status: "active",
      createdAt: Date.now(),
    });

    const targets = await t.query(
      "terminalTargets:listTerminalTargets" as any,
      {},
    );

    expect(targets.length).toBe(2);
    const types = targets.map((t: any) => t.type).sort();
    expect(types).toEqual(["adhoc", "agent"]);
  });

  test("excludes ended ad-hoc sessions", async () => {
    const t = convexTest(schema, modules);

    await t.mutation("terminalSessions:upsert" as any, {
      sessionName: "tina-adhoc-ended",
      tmuxPaneId: "%300",
      label: "Ended session",
      cli: "claude",
      status: "active",
      createdAt: Date.now(),
    });

    await t.mutation("terminalSessions:markEnded" as any, {
      sessionName: "tina-adhoc-ended",
      endedAt: Date.now(),
    });

    const targets = await t.query(
      "terminalTargets:listTerminalTargets" as any,
      {},
    );

    expect(targets.length).toBe(0);
  });

  test("excludes team members without tmuxPaneId", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "no-pane");

    await registerTeam(t, {
      teamName: "no-pane-phase-1",
      orchestrationId,
      phaseNumber: "1",
      tmuxSessionName: "tina-no-pane",
      createdAt: Date.now(),
    });

    // Member WITHOUT pane ID
    await t.mutation("teamMembers:upsertTeamMember" as any, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "headless-worker",
      recordedAt: "2026-02-13T10:00:00Z",
    });

    const targets = await t.query(
      "terminalTargets:listTerminalTargets" as any,
      {},
    );

    expect(targets.length).toBe(0);
  });

  test("includes context from ad-hoc sessions", async () => {
    const t = convexTest(schema, modules);

    await t.mutation("terminalSessions:upsert" as any, {
      sessionName: "tina-adhoc-ctx",
      tmuxPaneId: "%400",
      label: "Context session",
      cli: "claude",
      status: "active",
      contextType: "task",
      contextId: "task-123",
      contextSummary: "Review auth",
      createdAt: Date.now(),
    });

    const targets = await t.query(
      "terminalTargets:listTerminalTargets" as any,
      {},
    );

    expect(targets.length).toBe(1);
    expect(targets[0].context).toEqual({
      type: "task",
      id: "task-123",
      summary: "Review auth",
    });
  });
});
