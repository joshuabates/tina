import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  createFeatureFixture,
  createNode,
  createOrchestration,
  registerTeam,
} from "./test_helpers";

describe("teams:registerTeam", () => {
  test("inserts new team record", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const teamId = await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      phaseNumber: "1",
      createdAt: Date.now(),
    });

    expect(teamId).toBeTruthy();
  });

  test("idempotent upsert when same orchestrationId", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const id1 = await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      leadSessionId: "session-abc",
      phaseNumber: "1",
      createdAt: Date.now(),
    });

    const id2 = await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      leadSessionId: "session-xyz",
      tmuxSessionName: "tina-auth-feature-phase-1",
      phaseNumber: "1",
      createdAt: Date.now(),
    });

    expect(id2).toBe(id1);

    const team = await t.query(api.teams.getByTeamName, {
      teamName: "auth-feature-phase-1",
    });
    expect(team).not.toBeNull();
    expect(team!.tmuxSessionName).toBe("tina-auth-feature-phase-1");
  });

  test("stores tmux session name when provided", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await registerTeam(t, {
      teamName: "auth-feature-phase-2",
      orchestrationId,
      leadSessionId: "session-def",
      tmuxSessionName: "tina-auth-feature-phase-2",
      phaseNumber: "2",
      createdAt: Date.now(),
    });

    const team = await t.query(api.teams.getByTeamName, {
      teamName: "auth-feature-phase-2",
    });
    expect(team).not.toBeNull();
    expect(team!.tmuxSessionName).toBe("tina-auth-feature-phase-2");
  });

  test("errors when teamName exists with different orchestrationId", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchestrationId1 = await createOrchestration(t, {
      nodeId,
      featureName: "feature-a",
    });
    const orchestrationId2 = await createOrchestration(t, {
      nodeId,
      featureName: "feature-b",
    });

    await registerTeam(t, {
      teamName: "shared-team-name",
      orchestrationId: orchestrationId1,
      leadSessionId: "session-abc",
      createdAt: Date.now(),
    });

    await expect(
      registerTeam(t, {
        teamName: "shared-team-name",
        orchestrationId: orchestrationId2,
        leadSessionId: "session-xyz",
        createdAt: Date.now(),
      }),
    ).rejects.toThrow();
  });

  test("allows null phaseNumber for orchestration teams", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const teamId = await registerTeam(t, {
      teamName: "auth-feature-orchestration",
      orchestrationId,
      createdAt: Date.now(),
    });

    expect(teamId).toBeTruthy();
  });

  test("stores parentTeamId when provided", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const parentId = await registerTeam(t, {
      teamName: "auth-feature-orchestration",
      orchestrationId,
      createdAt: Date.now(),
    });

    await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      leadSessionId: "session-def",
      phaseNumber: "1",
      parentTeamId: parentId,
      createdAt: Date.now(),
    });

    const child = await t.query(api.teams.getByTeamName, {
      teamName: "auth-feature-phase-1",
    });

    expect(child).not.toBeNull();
    expect(child!.parentTeamId).toBe(parentId);
  });

  test("updates parentTeamId on upsert", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const parentId = await registerTeam(t, {
      teamName: "auth-feature-orchestration",
      orchestrationId,
      createdAt: Date.now(),
    });

    await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      leadSessionId: "session-def",
      phaseNumber: "1",
      createdAt: Date.now(),
    });

    await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      leadSessionId: "session-def",
      phaseNumber: "1",
      parentTeamId: parentId,
      createdAt: Date.now(),
    });

    const child = await t.query(api.teams.getByTeamName, {
      teamName: "auth-feature-phase-1",
    });

    expect(child!.parentTeamId).toBe(parentId);
  });
});

describe("teams:getByTeamName", () => {
  test("returns team record when exists", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      phaseNumber: "1",
      createdAt: 1707350400000,
    });

    const result = await t.query(api.teams.getByTeamName, {
      teamName: "auth-feature-phase-1",
    });

    expect(result).not.toBeNull();
    expect(result!.teamName).toBe("auth-feature-phase-1");
    expect(result!.orchestrationId).toBe(orchestrationId);
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

describe("teams:listActiveTeams", () => {
  test("returns teams with active orchestrations", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "active-feature");

    await registerTeam(t, {
      teamName: "active-feature-orchestration",
      orchestrationId,
      leadSessionId: "session-1",
      createdAt: Date.now(),
    });

    const teams = await t.query(api.teams.listActiveTeams, {});
    expect(teams.length).toBe(1);
    expect(teams[0].teamName).toBe("active-feature-orchestration");
    expect(teams[0].orchestrationStatus).toBe("planning");
    expect(teams[0].featureName).toBe("active-feature");
  });

  test("excludes teams with completed orchestrations", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchestrationId = await createOrchestration(t, {
      nodeId,
      featureName: "done-feature",
      branch: "tina/done-feature",
      totalPhases: 1,
      currentPhase: 1,
      status: "complete",
      startedAt: "2026-02-08T10:00:00Z",
      worktreePath: undefined,
    });

    await registerTeam(t, {
      teamName: "done-feature-orchestration",
      orchestrationId,
      leadSessionId: "session-1",
      createdAt: Date.now(),
    });

    const teams = await t.query(api.teams.listActiveTeams, {});
    expect(teams.length).toBe(0);
  });

  test("includes teams with blocked orchestrations", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);
    const orchestrationId = await createOrchestration(t, {
      nodeId,
      featureName: "blocked-feature",
      branch: "tina/blocked-feature",
      totalPhases: 1,
      currentPhase: 1,
      status: "blocked",
      startedAt: "2026-02-08T10:00:00Z",
      worktreePath: undefined,
    });

    await registerTeam(t, {
      teamName: "blocked-feature-orchestration",
      orchestrationId,
      leadSessionId: "session-1",
      createdAt: Date.now(),
    });

    const teams = await t.query(api.teams.listActiveTeams, {});
    expect(teams.length).toBe(1);
    expect(teams[0].teamName).toBe("blocked-feature-orchestration");
    expect(teams[0].orchestrationStatus).toBe("blocked");
  });

  test("returns empty array when no teams", async () => {
    const t = convexTest(schema);
    const teams = await t.query(api.teams.listActiveTeams, {});
    expect(teams).toEqual([]);
  });
});

describe("teams:listByParent", () => {
  test("returns child teams for a parent", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const parentId = await registerTeam(t, {
      teamName: "auth-feature-orchestration",
      orchestrationId,
      createdAt: Date.now(),
    });

    await registerTeam(t, {
      teamName: "auth-feature-phase-1",
      orchestrationId,
      leadSessionId: "session-def",
      phaseNumber: "1",
      parentTeamId: parentId,
      createdAt: Date.now(),
    });

    await registerTeam(t, {
      teamName: "auth-feature-phase-2",
      orchestrationId,
      leadSessionId: "session-ghi",
      phaseNumber: "2",
      parentTeamId: parentId,
      createdAt: Date.now(),
    });

    const children = await t.query(api.teams.listByParent, {
      parentTeamId: parentId,
    });

    expect(children.length).toBe(2);
    const names = children.map((c: any) => c.teamName).sort();
    expect(names).toEqual(["auth-feature-phase-1", "auth-feature-phase-2"]);
  });

  test("returns empty array when no children", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "solo-feature");

    const parentId = await registerTeam(t, {
      teamName: "solo-feature-orchestration",
      orchestrationId,
      createdAt: Date.now(),
    });

    const children = await t.query(api.teams.listByParent, {
      parentTeamId: parentId,
    });

    expect(children).toEqual([]);
  });
});

describe("orchestrations:getByFeature", () => {
  test("returns latest orchestration for feature", async () => {
    const t = convexTest(schema);
    const nodeId = await createNode(t);

    await createOrchestration(t, {
      nodeId,
      featureName: "auth",
      designDocPath: "/docs/old.md",
      branch: "tina/auth",
      totalPhases: 2,
      currentPhase: 1,
      status: "complete",
      startedAt: "2026-02-07T10:00:00Z",
      worktreePath: undefined,
    });

    const nodeId2 = await createNode(t, {
      name: "test-node-2",
      authTokenHash: "def456",
    });

    const laterId = await createOrchestration(t, {
      nodeId: nodeId2,
      featureName: "auth",
      designDocPath: "/docs/new.md",
      branch: "tina/auth",
      totalPhases: 3,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-08T10:00:00Z",
      worktreePath: undefined,
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
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    await t.mutation(api.phases.upsertPhase, {
      orchestrationId,
      phaseNumber: "1",
      status: "executing",
      startedAt: "2026-02-08T10:00:00Z",
    });

    const result = await t.query(api.phases.getPhaseStatus, {
      orchestrationId,
      phaseNumber: "1",
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("executing");
    expect(result!.phaseNumber).toBe("1");
  });

  test("returns null when phase does not exist", async () => {
    const t = convexTest(schema);
    const { orchestrationId } = await createFeatureFixture(t, "auth-feature");

    const result = await t.query(api.phases.getPhaseStatus, {
      orchestrationId,
      phaseNumber: "99",
    });

    expect(result).toBeNull();
  });
});
