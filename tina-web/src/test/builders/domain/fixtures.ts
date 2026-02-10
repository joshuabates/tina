import type {
  OrchestrationDetail,
  OrchestrationSummary,
  Phase,
  ProjectSummary,
  TaskEvent,
  TeamMember,
} from "@/schemas"
import {
  buildOrchestrationSummary,
  buildPhase,
  buildProjectSummary,
  buildTaskEvent,
  buildTeamMember,
} from "./entities"
import { none, some } from "./primitives"

interface PhaseSpec {
  id: string
  number: string
  status: string
  creationTime?: number
  overrides?: Partial<Phase>
}

function buildPhases(orchestrationId: string, specs: readonly PhaseSpec[]): Phase[] {
  return specs.map((spec) =>
    buildPhase({
      _id: spec.id,
      _creationTime: spec.creationTime ?? 1234567890,
      orchestrationId,
      phaseNumber: spec.number,
      status: spec.status,
      ...spec.overrides,
    }),
  )
}

interface PhaseTaskSpec {
  id: string
  taskId: string
  subject: string
  creationTime?: number
  description?: ReturnType<typeof some<string>> | ReturnType<typeof none<string>>
  status?: string
  owner?: ReturnType<typeof some<string>> | ReturnType<typeof none<string>>
  blockedBy?: ReturnType<typeof some<string>> | ReturnType<typeof none<string>>
  recordedAt: string
}

function buildPhaseTasks(
  orchestrationId: string,
  phaseNumber: string,
  specs: readonly PhaseTaskSpec[],
): TaskEvent[] {
  return specs.map((spec) =>
    buildTaskEvent({
      _id: spec.id,
      _creationTime: spec.creationTime ?? 1234567890,
      orchestrationId,
      phaseNumber: some(phaseNumber),
      taskId: spec.taskId,
      subject: spec.subject,
      description: spec.description ?? none<string>(),
      ...(spec.status ? { status: spec.status } : {}),
      owner: spec.owner ?? none<string>(),
      blockedBy: spec.blockedBy ?? none<string>(),
      recordedAt: spec.recordedAt,
    }),
  )
}

interface TeamMemberSpec {
  id: string
  creationTime?: number
  phaseNumber: string
  agentName: string
  agentType?: ReturnType<typeof some<string>> | ReturnType<typeof none<string>>
  model?: ReturnType<typeof some<string>> | ReturnType<typeof none<string>>
  joinedAt?: ReturnType<typeof some<string>> | ReturnType<typeof none<string>>
  recordedAt: string
}

function buildMembers(orchestrationId: string, specs: readonly TeamMemberSpec[]): TeamMember[] {
  return specs.map((spec) =>
    buildTeamMember({
      _id: spec.id,
      _creationTime: spec.creationTime ?? 1234567890,
      orchestrationId,
      phaseNumber: spec.phaseNumber,
      agentName: spec.agentName,
      agentType: spec.agentType ?? none<string>(),
      model: spec.model ?? none<string>(),
      joinedAt: spec.joinedAt ?? none<string>(),
      recordedAt: spec.recordedAt,
    }),
  )
}

export function buildOrchestrationDetail(
  overrides: Partial<OrchestrationDetail> = {},
): OrchestrationDetail {
  const orchestrationId = "abc123"
  const phases = buildPhases(orchestrationId, [
    {
      id: "phase1",
      number: "1",
      status: "executing",
      overrides: {
        planPath: some("/docs/plans/phase-1.md"),
        startedAt: some("2024-01-01T10:00:00Z"),
      },
    },
    {
      id: "phase2",
      number: "2",
      status: "planning",
      creationTime: 1234567891,
    },
  ])

  return {
    _id: orchestrationId,
    _creationTime: 1234567890,
    nodeId: "n1",
    featureName: "my-feature",
    designDocPath: "/docs/my-feature.md",
    branch: "tina/my-feature",
    worktreePath: none<string>(),
    totalPhases: 3,
    currentPhase: 1,
    status: "executing",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: none<string>(),
    totalElapsedMins: none<number>(),
    nodeName: "node1",
    phases,
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [],
    ...overrides,
  }
}

export function buildTaskListDetail(
  overrides: Partial<OrchestrationDetail> = {},
): OrchestrationDetail {
  const orchestrationId = "orch1"
  const phases = buildPhases(orchestrationId, [
    {
      id: "phase1",
      number: "1",
      status: "executing",
      overrides: {
        planPath: some("/path/to/plan1.md"),
        planningMins: some(10),
        executionMins: some(20),
        startedAt: some("2024-01-01T10:00:00Z"),
      },
    },
    {
      id: "phase2",
      number: "2",
      status: "planning",
      creationTime: 1234567891,
    },
  ])

  const phaseOneTasks = buildPhaseTasks(orchestrationId, "1", [
    {
      id: "task1",
      taskId: "1",
      subject: "Implement feature A",
      description: some("Description for task 1"),
      status: "completed",
      owner: some("worker1"),
      recordedAt: "2024-01-01T10:00:00Z",
    },
    {
      id: "task2",
      taskId: "2",
      subject: "Write tests for feature A",
      creationTime: 1234567891,
      description: some("Description for task 2"),
      status: "in_progress",
      owner: some("worker2"),
      recordedAt: "2024-01-01T10:05:00Z",
    },
    {
      id: "task3",
      taskId: "3",
      subject: "Review implementation",
      creationTime: 1234567892,
      description: some("Description for task 3"),
      blockedBy: some("Task 2 must complete first"),
      recordedAt: "2024-01-01T10:10:00Z",
    },
  ])

  return buildOrchestrationDetail({
    _id: orchestrationId,
    featureName: "test-feature",
    designDocPath: "/docs/test.md",
    branch: "tina/test-feature",
    phases,
    phaseTasks: {
      "1": phaseOneTasks,
      "2": [],
    },
    teamMembers: [],
    ...overrides,
  })
}

export function buildPhaseTimelineDetail(
  overrides: Partial<OrchestrationDetail> = {},
): OrchestrationDetail {
  const orchestrationId = "orch1"
  const phases = buildPhases(orchestrationId, [
    {
      id: "phase1",
      number: "1",
      status: "executing",
      overrides: {
        planPath: some("/path/to/plan1.md"),
        planningMins: some(10),
        executionMins: some(20),
        startedAt: some("2024-01-01T10:00:00Z"),
      },
    },
    {
      id: "phase2",
      number: "2",
      status: "planning",
      creationTime: 1234567891,
    },
    {
      id: "phase3",
      number: "3",
      status: "pending",
      creationTime: 1234567892,
    },
  ])

  const phaseOneTasks = buildPhaseTasks(orchestrationId, "1", [
    {
      id: "task1",
      taskId: "1",
      subject: "Task 1",
      description: some("Description 1"),
      status: "completed",
      owner: some("worker1"),
      recordedAt: "2024-01-01T10:00:00Z",
    },
    {
      id: "task2",
      taskId: "2",
      subject: "Task 2",
      creationTime: 1234567891,
      description: some("Description 2"),
      status: "in_progress",
      owner: some("worker2"),
      recordedAt: "2024-01-01T10:05:00Z",
    },
  ])

  const teamMembers = buildMembers(orchestrationId, [
    {
      id: "member1",
      phaseNumber: "1",
      agentName: "worker1",
      agentType: some("implementer"),
      model: some("sonnet"),
      joinedAt: some("2024-01-01T10:00:00Z"),
      recordedAt: "2024-01-01T10:00:00Z",
    },
    {
      id: "member2",
      phaseNumber: "1",
      agentName: "worker2",
      creationTime: 1234567891,
      agentType: some("reviewer"),
      model: some("sonnet"),
      joinedAt: some("2024-01-01T10:05:00Z"),
      recordedAt: "2024-01-01T10:05:00Z",
    },
  ])

  return buildOrchestrationDetail({
    _id: orchestrationId,
    featureName: "test-feature",
    designDocPath: "/docs/test.md",
    branch: "tina/test-feature",
    phases,
    phaseTasks: {
      "1": phaseOneTasks,
      "2": [],
    },
    teamMembers,
    ...overrides,
  })
}

export interface AppIntegrationFixtureOverrides {
  projects?: ProjectSummary[]
  orchestrations?: OrchestrationSummary[]
  phases?: Phase[]
  detail?: Partial<OrchestrationDetail>
}

export interface AppIntegrationFixture {
  projects: ProjectSummary[]
  orchestrations: OrchestrationSummary[]
  phases: Phase[]
  detail: OrchestrationDetail
}

function defaultIntegrationPhases(): Phase[] {
  return buildPhases("abc123", [
    {
      id: "phase1",
      number: "1",
      status: "completed",
      overrides: {
        planPath: some("/docs/plans/phase-1.md"),
        gitRange: some("abc..def"),
        planningMins: some(10),
        executionMins: some(20),
        reviewMins: some(5),
        startedAt: some("2024-01-01T10:00:00Z"),
        completedAt: some("2024-01-01T10:35:00Z"),
      },
    },
    {
      id: "phase2",
      number: "2",
      status: "executing",
      creationTime: 1234567891,
      overrides: {
        planPath: some("/docs/plans/phase-2.md"),
        planningMins: some(15),
        startedAt: some("2024-01-01T10:40:00Z"),
      },
    },
    {
      id: "phase3",
      number: "3",
      status: "pending",
      creationTime: 1234567892,
    },
  ])
}

export function buildAppIntegrationFixture(
  overrides: AppIntegrationFixtureOverrides = {},
): AppIntegrationFixture {
  const projects = overrides.projects ?? [buildProjectSummary()]
  const orchestrations = overrides.orchestrations ?? [buildOrchestrationSummary()]
  const phases = overrides.phases ?? defaultIntegrationPhases()

  const detail = buildOrchestrationDetail({
    _id: "abc123",
    featureName: "my-feature",
    designDocPath: "/docs/my-feature.md",
    branch: "tina/my-feature",
    currentPhase: 2,
    phases,
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [],
    ...overrides.detail,
  })

  return {
    projects,
    orchestrations,
    phases,
    detail,
  }
}
