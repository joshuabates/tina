import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

const modules = import.meta.glob("./**/*.*s");

describe("teamMembers:upsertTeamMember", () => {
  test("stores tmuxPaneId when provided", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "pane-feature");

    const id = await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "worker-1",
      agentType: "general-purpose",
      model: "claude-sonnet-4-5",
      tmuxPaneId: "%42",
      recordedAt: "2026-02-13T10:00:00Z",
    });

    expect(id).toBeTruthy();

    const member = await t.run(async (ctx) => {
      return await ctx.db.get(id);
    });
    expect(member).not.toBeNull();
    expect(member!.tmuxPaneId).toBe("%42");
  });

  test("upsert preserves existing tmuxPaneId when not provided", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "pane-feature");

    await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "worker-1",
      tmuxPaneId: "%42",
      recordedAt: "2026-02-13T10:00:00Z",
    });

    // Upsert without tmuxPaneId should preserve existing
    await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "worker-1",
      recordedAt: "2026-02-13T10:01:00Z",
    });

    const members = await t.run(async (ctx) => {
      return await ctx.db
        .query("teamMembers")
        .withIndex("by_orchestration_phase_agent", (q: any) =>
          q
            .eq("orchestrationId", orchestrationId)
            .eq("phaseNumber", "1")
            .eq("agentName", "worker-1"),
        )
        .first();
    });
    expect(members!.tmuxPaneId).toBe("%42");
  });

  test("works without tmuxPaneId (optional field)", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "no-pane");

    const id = await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "worker-1",
      recordedAt: "2026-02-13T10:00:00Z",
    });

    expect(id).toBeTruthy();

    const member = await t.run(async (ctx) => {
      return await ctx.db.get(id);
    });
    expect(member!.tmuxPaneId).toBeUndefined();
  });
});

describe("teamMembers:prunePhaseMembers", () => {
  test("removes members that are not in the active list for a phase", async () => {
    const t = convexTest(schema, modules);
    const { orchestrationId } = await createFeatureFixture(t, "prune-feature");

    await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "worker-1",
      recordedAt: "2026-02-13T10:00:00Z",
    });
    await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "worker-2",
      recordedAt: "2026-02-13T10:00:00Z",
    });
    // Different phase should be untouched.
    await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "2",
      agentName: "worker-3",
      recordedAt: "2026-02-13T10:00:00Z",
    });

    await t.mutation("teamMembers:prunePhaseMembers" as any, {
      orchestrationId,
      phaseNumber: "1",
      activeAgentNames: ["worker-1"],
    });

    const members = await t.run(async (ctx) =>
      ctx.db
        .query("teamMembers")
        .withIndex("by_orchestration", (q: any) =>
          q.eq("orchestrationId", orchestrationId),
        )
        .collect(),
    );

    const names = members
      .map((member) => `${member.phaseNumber}:${member.agentName}`)
      .sort();
    expect(names).toEqual(["1:worker-1", "2:worker-3"]);
  });
});
