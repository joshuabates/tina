import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// Helper: create a node so we can create orchestrations
async function createNode(t: ReturnType<typeof convexTest>) {
  return await t.mutation(api.nodes.registerNode, {
    name: "test-node",
    os: "darwin",
    authTokenHash: "abc123",
  });
}

// Helper: create an orchestration and return its ID
async function createOrchestration(
  t: ReturnType<typeof convexTest>,
  nodeId: string,
  featureName: string,
) {
  return await t.mutation(api.orchestrations.upsertOrchestration, {
    nodeId: nodeId as any,
    featureName,
    designDocPath: "/docs/design.md",
    branch: `tina/${featureName}`,
    worktreePath: `/repo/.worktrees/${featureName}`,
    totalPhases: 3,
    currentPhase: 1,
    status: "planning",
    startedAt: "2026-02-08T10:00:00Z",
  });
}

describe("teams:registerTeam", () => {
  test("inserts new team record", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchId = await createOrchestration(t, nodeId, "auth-feature");

    const teamId = await t.mutation(api.teams.registerTeam, {
      teamName: "auth-feature-phase-1",
      orchestrationId: orchId,
      leadSessionId: "session-abc",
      phaseNumber: "1",
      createdAt: Date.now(),
    });

    expect(teamId).toBeTruthy();
  });

  test("idempotent upsert when same orchestrationId", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchId = await createOrchestration(t, nodeId, "auth-feature");

    const id1 = await t.mutation(api.teams.registerTeam, {
      teamName: "auth-feature-phase-1",
      orchestrationId: orchId,
      leadSessionId: "session-abc",
      phaseNumber: "1",
      createdAt: Date.now(),
    });

    // Same team name, same orchestrationId → should update, return same ID
    const id2 = await t.mutation(api.teams.registerTeam, {
      teamName: "auth-feature-phase-1",
      orchestrationId: orchId,
      leadSessionId: "session-xyz",
      phaseNumber: "1",
      createdAt: Date.now(),
    });

    expect(id2).toBe(id1);
  });

  test("errors when teamName exists with different orchestrationId", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchId1 = await createOrchestration(t, nodeId, "feature-a");
    const orchId2 = await createOrchestration(t, nodeId, "feature-b");

    await t.mutation(api.teams.registerTeam, {
      teamName: "shared-team-name",
      orchestrationId: orchId1,
      leadSessionId: "session-abc",
      createdAt: Date.now(),
    });

    // Same team name, different orchestrationId → should error
    await expect(
      t.mutation(api.teams.registerTeam, {
        teamName: "shared-team-name",
        orchestrationId: orchId2,
        leadSessionId: "session-xyz",
        createdAt: Date.now(),
      }),
    ).rejects.toThrow();
  });

  test("allows null phaseNumber for orchestration teams", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchId = await createOrchestration(t, nodeId, "auth-feature");

    const teamId = await t.mutation(api.teams.registerTeam, {
      teamName: "auth-feature-orchestration",
      orchestrationId: orchId,
      leadSessionId: "session-abc",
      createdAt: Date.now(),
    });

    expect(teamId).toBeTruthy();
  });
});

describe("teams:getByTeamName", () => {
  test("returns team record when exists", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchId = await createOrchestration(t, nodeId, "auth-feature");

    await t.mutation(api.teams.registerTeam, {
      teamName: "auth-feature-phase-1",
      orchestrationId: orchId,
      leadSessionId: "session-abc",
      phaseNumber: "1",
      createdAt: 1707350400000,
    });

    const result = await t.query(api.teams.getByTeamName, {
      teamName: "auth-feature-phase-1",
    });

    expect(result).not.toBeNull();
    expect(result!.teamName).toBe("auth-feature-phase-1");
    expect(result!.orchestrationId).toBe(orchId);
    expect(result!.leadSessionId).toBe("session-abc");
    expect(result!.phaseNumber).toBe("1");
    expect(result!.createdAt).toBe(1707350400000);
  });

  test("returns null when team does not exist", async () => {
    const t = convexTest(schema);

    const result = await t.query(api.teams.getByTeamName, {
      teamName: "nonexistent",
    });

    expect(result).toBeNull();
  });
});

describe("orchestrations:getByFeature", () => {
  test("returns latest orchestration for feature", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);

    // Create two orchestrations for same feature
    await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId: nodeId as any,
      featureName: "auth",
      designDocPath: "/docs/old.md",
      branch: "tina/auth",
      totalPhases: 2,
      currentPhase: 1,
      status: "complete",
      startedAt: "2026-02-07T10:00:00Z",
    });

    // Create second node to avoid upsert collision (same node+feature = update)
    const nodeId2 = await t.mutation(api.nodes.registerNode, {
      name: "test-node-2",
      os: "darwin",
      authTokenHash: "def456",
    });

    const laterId = await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId: nodeId2 as any,
      featureName: "auth",
      designDocPath: "/docs/new.md",
      branch: "tina/auth",
      totalPhases: 3,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-08T10:00:00Z",
    });

    const result = await t.query(api.orchestrations.getByFeature, {
      featureName: "auth",
    });

    expect(result).not.toBeNull();
    expect(result!._id).toBe(laterId);
    expect(result!.designDocPath).toBe("/docs/new.md");
    expect(result!.startedAt).toBe("2026-02-08T10:00:00Z");
  });

  test("returns null when no orchestrations for feature", async () => {
    const t = convexTest(schema);

    const result = await t.query(api.orchestrations.getByFeature, {
      featureName: "nonexistent",
    });

    expect(result).toBeNull();
  });
});

describe("phases:getPhaseStatus", () => {
  test("returns phase record when exists", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchId = await createOrchestration(t, nodeId, "auth-feature");

    await t.mutation(api.phases.upsertPhase, {
      orchestrationId: orchId,
      phaseNumber: "1",
      status: "executing",
      startedAt: "2026-02-08T10:00:00Z",
    });

    const result = await t.query(api.phases.getPhaseStatus, {
      orchestrationId: orchId,
      phaseNumber: "1",
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("executing");
    expect(result!.phaseNumber).toBe("1");
  });

  test("returns null when phase does not exist", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchId = await createOrchestration(t, nodeId, "auth-feature");

    const result = await t.query(api.phases.getPhaseStatus, {
      orchestrationId: orchId,
      phaseNumber: "99",
    });

    expect(result).toBeNull();
  });
});
