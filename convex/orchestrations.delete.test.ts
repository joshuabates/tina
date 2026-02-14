import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createNode } from "./test_helpers";

// Worktree module discovery: convex-test resolves modules via node_modules,
// which points to the main repo. Explicit glob ensures worktree modules are used.
const modules = import.meta.glob("./**/*.*s");

async function deleteOrchestrationUntilDone(
  t: ReturnType<typeof convexTest>,
  orchestrationId: string,
) {
  let result: any = null;

  for (let attempt = 0; attempt < 400; attempt++) {
    result = await t.mutation(api.orchestrations.deleteOrchestration, {
      orchestrationId: orchestrationId as any,
    });
    if (result.done) {
      return result;
    }
  }

  throw new Error("Timed out deleting orchestration");
}

describe("orchestrations:deleteOrchestration", () => {
  test("deletes orchestration and associated records", async () => {
    const t = convexTest(schema, modules);

    const projectId = await t.mutation(api.projects.createProject, {
      name: "orch-delete-target",
      repoPath: "/Users/joshua/Projects/orch-delete-target",
    });
    const nodeId = await createNode(t, { name: "orch-delete-node" });

    const orchestrationId = await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId,
      projectId,
      featureName: "orchestration-delete-feature",
      specDocPath: "/docs/orch-delete.md",
      branch: "tina/orchestration-delete-feature",
      worktreePath: "/repo/.worktrees/orchestration-delete-feature",
      totalPhases: 2,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-11T01:00:00Z",
    });

    await t.mutation(api.phases.upsertPhase, {
      orchestrationId,
      phaseNumber: "1",
      status: "planning",
      planPath: "/docs/plans/orch-delete-phase-1.md",
    });

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_started",
      source: "orchestrator",
      summary: "Started orchestration delete phase",
      recordedAt: "2026-02-11T01:01:00Z",
    });

    await t.mutation(api.tasks.recordTaskEvent, {
      orchestrationId,
      phaseNumber: "1",
      taskId: "orch-task-1",
      subject: "Wire delete action",
      status: "done",
      recordedAt: "2026-02-11T01:02:00Z",
    });

    await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "coder",
      agentType: "implementation",
      model: "gpt-5",
      recordedAt: "2026-02-11T01:03:00Z",
    });

    await t.mutation(api.teams.registerTeam, {
      teamName: "orch-delete-team",
      orchestrationId,
      leadSessionId: "orch-session-delete",
      localDirName: "orch-delete-team",
      phaseNumber: "1",
      createdAt: 1707350400000,
    });

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "orchdelete123",
      shortSha: "orchdel",
    });

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "/docs/plans/orch-delete.md",
      content: "Delete orchestration and all associations",
    });

    await t.mutation(api.supervisorStates.upsertSupervisorState, {
      nodeId,
      featureName: "orchestration-delete-feature",
      stateJson: "{\"phase\":\"1\"}",
      updatedAt: 1707350400000,
    });

    const deleteResult = await deleteOrchestrationUntilDone(t, orchestrationId);

    expect(deleteResult).toEqual({
      done: true,
      deleted: true,
      deletedOrchestrationId: orchestrationId,
    });

    const byProject = await t.query(api.orchestrations.listByProject, {
      projectId,
    });
    expect(byProject).toEqual([]);

    const detail = await t.query(api.orchestrations.getOrchestrationDetail, {
      orchestrationId,
    });
    expect(detail).toBeNull();

    const phase = await t.query(api.phases.getPhaseStatus, {
      orchestrationId,
      phaseNumber: "1",
    });
    expect(phase).toBeNull();

    const events = await t.query(api.events.listEvents, {
      orchestrationId,
    });
    expect(events).toEqual([]);

    const taskEvents = await t.query(api.tasks.listTaskEvents, {
      orchestrationId,
      taskId: "orch-task-1",
    });
    expect(taskEvents).toEqual([]);

    const commits = await t.query(api.commits.listCommits, {
      orchestrationId,
    });
    expect(commits).toEqual([]);

    const plans = await t.query(api.plans.listPlans, {
      orchestrationId,
    });
    expect(plans).toEqual([]);

    const teams = await t.query(api.teams.listAllTeams, {});
    expect(teams).toEqual([]);

    const supervisorState = await t.query(api.supervisorStates.getSupervisorState, {
      nodeId,
      featureName: "orchestration-delete-feature",
    });
    expect(supervisorState).toBeNull();

    const projects = await t.query(api.projects.listProjects, {});
    expect(projects.map((project) => project._id)).toContain(projectId);
  });

  test("returns deleted false when orchestration is missing", async () => {
    const t = convexTest(schema, modules);

    const projectId = await t.mutation(api.projects.createProject, {
      name: "orchestration-missing",
      repoPath: "/Users/joshua/Projects/orchestration-missing",
    });
    const nodeId = await createNode(t, { name: "orchestration-missing-node" });

    const orchestrationId = await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId,
      projectId,
      featureName: "orchestration-missing-feature",
      specDocPath: "/docs/orchestration-missing.md",
      branch: "tina/orchestration-missing-feature",
      worktreePath: "/repo/.worktrees/orchestration-missing-feature",
      totalPhases: 1,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-11T01:10:00Z",
    });

    await deleteOrchestrationUntilDone(t, orchestrationId);
    const result = await deleteOrchestrationUntilDone(t, orchestrationId);

    expect(result).toEqual({
      done: true,
      deleted: false,
      deletedOrchestrationId: orchestrationId,
    });
  });
});
