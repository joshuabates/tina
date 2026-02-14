import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
import { createNode, createProject } from "./test_helpers";

describe("projects:deleteProject", () => {
  test("deletes project, orchestrations, and associated records", async () => {
    const t = convexTest(schema, modules);

    const projectId = await createProject(t, {
      name: "delete-target",
      repoPath: "/Users/joshua/Projects/delete-target",
    });
    const nodeId = await createNode(t, { name: "delete-node" });

    const orchestrationId = await t.mutation(api.orchestrations.upsertOrchestration, {
      nodeId,
      projectId,
      featureName: "delete-me-feature",
      specDocPath: "/docs/delete-me.md",
      branch: "tina/delete-me-feature",
      worktreePath: "/repo/.worktrees/delete-me-feature",
      totalPhases: 2,
      currentPhase: 1,
      status: "planning",
      startedAt: "2026-02-11T00:00:00Z",
    });

    await t.mutation(api.phases.upsertPhase, {
      orchestrationId,
      phaseNumber: "1",
      status: "planning",
      planPath: "/docs/plans/phase-1.md",
    });

    await t.mutation(api.events.recordEvent, {
      orchestrationId,
      eventType: "phase_started",
      source: "orchestrator",
      summary: "Started phase 1",
      recordedAt: "2026-02-11T00:01:00Z",
    });

    await t.mutation(api.tasks.recordTaskEvent, {
      orchestrationId,
      phaseNumber: "1",
      taskId: "task-1",
      subject: "Implement delete button",
      status: "done",
      recordedAt: "2026-02-11T00:02:00Z",
    });

    await t.mutation(api.teamMembers.upsertTeamMember, {
      orchestrationId,
      phaseNumber: "1",
      agentName: "coder",
      agentType: "implementation",
      model: "gpt-5",
      recordedAt: "2026-02-11T00:03:00Z",
    });

    await t.mutation(api.teams.registerTeam, {
      teamName: "delete-team",
      orchestrationId,
      leadSessionId: "session-delete",
      localDirName: "delete-team",
      phaseNumber: "1",
      createdAt: 1707350400000,
    });

    await t.mutation(api.commits.recordCommit, {
      orchestrationId,
      phaseNumber: "1",
      sha: "deletefeature123",
      shortSha: "deletef",
    });

    await t.mutation(api.plans.upsertPlan, {
      orchestrationId,
      phaseNumber: "1",
      planPath: "/docs/plans/delete.md",
      content: "Delete project and cleanup data",
    });

    await t.mutation(api.supervisorStates.upsertSupervisorState, {
      nodeId,
      featureName: "delete-me-feature",
      stateJson: "{\"phase\":\"1\"}",
      updatedAt: 1707350400000,
    });

    const deleteResult = await t.mutation(api.projects.deleteProject, {
      projectId,
    });

    expect(deleteResult).toEqual({
      deleted: true,
      deletedProjectId: projectId,
      deletedOrchestrations: 1,
    });

    const projects = await t.query(api.projects.listProjects, {});
    expect(projects.map((project) => project._id)).not.toContain(projectId);

    const orchestrations = await t.query(api.orchestrations.listByProject, {
      projectId,
    });
    expect(orchestrations).toEqual([]);

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
      taskId: "task-1",
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
      featureName: "delete-me-feature",
    });
    expect(supervisorState).toBeNull();
  });

  test("returns deleted false when project is missing", async () => {
    const t = convexTest(schema, modules);

    const projectId = await createProject(t, {
      name: "missing-project",
      repoPath: "/Users/joshua/Projects/missing-project",
    });
    await t.mutation(api.projects.deleteProject, { projectId });

    const result = await t.mutation(api.projects.deleteProject, { projectId });

    expect(result).toEqual({
      deleted: false,
      deletedProjectId: projectId,
      deletedOrchestrations: 0,
    });
  });

  test("deletes project and cascades to PM tables (specs, tickets, comments, counters)", async () => {
    const t = convexTest(schema, modules);

    const projectId = await createProject(t, {
      name: "pm-cascade-test",
      repoPath: "/Users/joshua/Projects/pm-cascade-test",
    });

    // Create a spec
    const specId = await t.mutation(api.specs.createSpec, {
      projectId,
      title: "Test Spec",
      markdown: "# Test",
    });

    // Create a ticket
    const ticketId = await t.mutation(api.tickets.createTicket, {
      projectId,
      title: "Test Ticket",
      description: "Test ticket description",
      priority: "medium",
    });

    // Create a spec comment
    await t.mutation(api.workComments.addComment, {
      projectId,
      targetType: "spec",
      targetId: specId,
      authorType: "human",
      authorName: "test-user",
      body: "Spec comment",
    });

    // Create a ticket comment
    await t.mutation(api.workComments.addComment, {
      projectId,
      targetType: "ticket",
      targetId: ticketId,
      authorType: "agent",
      authorName: "test-agent",
      body: "Ticket comment",
    });

    // Verify entities exist before deletion
    const specsBefore = await t.query(api.specs.listSpecs, {
      projectId,
    });
    expect(specsBefore.length).toBe(1);

    const ticketsBefore = await t.query(api.tickets.listTickets, {
      projectId,
    });
    expect(ticketsBefore.length).toBe(1);

    const specCommentsBefore = await t.query(api.workComments.listComments, {
      targetType: "spec",
      targetId: specId,
    });
    expect(specCommentsBefore.length).toBe(1);

    const ticketCommentsBefore = await t.query(api.workComments.listComments, {
      targetType: "ticket",
      targetId: ticketId,
    });
    expect(ticketCommentsBefore.length).toBe(1);

    // Delete the project
    const deleteResult = await t.mutation(api.projects.deleteProject, {
      projectId,
    });

    expect(deleteResult.deleted).toBe(true);

    // Verify all PM entities are deleted
    const specsAfter = await t.query(api.specs.listSpecs, {
      projectId,
    });
    expect(specsAfter).toEqual([]);

    const ticketsAfter = await t.query(api.tickets.listTickets, {
      projectId,
    });
    expect(ticketsAfter).toEqual([]);

    const specCommentsAfter = await t.query(api.workComments.listComments, {
      targetType: "spec",
      targetId: specId,
    });
    expect(specCommentsAfter).toEqual([]);

    const ticketCommentsAfter = await t.query(api.workComments.listComments, {
      targetType: "ticket",
      targetId: ticketId,
    });
    expect(ticketCommentsAfter).toEqual([]);
  });
});
