import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createFeatureFixture } from "./test_helpers";

describe("teamMembers:upsertTeamMember", () => {
  test("stores tmuxPaneId when provided", async () => {
    const t = convexTest(schema);
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
    const t = convexTest(schema);
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
    const t = convexTest(schema);
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
