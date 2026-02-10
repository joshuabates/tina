import { Option } from "effect"
import type {
  OrchestrationEvent,
  OrchestrationDetail,
  OrchestrationSummary,
  Phase,
  ProjectSummary,
  TaskEvent,
  TeamMember,
} from "@/schemas"

export const some = Option.some

export function none<A>(): Option.Option<A> {
  return Option.none<A>()
}

export function buildProjectSummary(
  overrides: Partial<ProjectSummary> = {},
): ProjectSummary {
  return {
    _id: "p1",
    _creationTime: 1234567890,
    name: "Project Alpha",
    repoPath: "/path/to/alpha",
    createdAt: "2024-01-01T00:00:00Z",
    orchestrationCount: 1,
    latestFeature: null,
    latestStatus: null,
    ...overrides,
  }
}

export function buildOrchestrationSummary(
  overrides: Partial<OrchestrationSummary> = {},
): OrchestrationSummary {
  return {
    _id: "abc123",
    _creationTime: 1234567890,
    nodeId: "n1",
    projectId: some("p1"),
    featureName: "my-feature",
    designDocPath: "/docs/my-feature.md",
    branch: "tina/my-feature",
    worktreePath: none<string>(),
    totalPhases: 3,
    currentPhase: 2,
    status: "executing",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: none<string>(),
    totalElapsedMins: none<number>(),
    nodeName: "node1",
    ...overrides,
  }
}

export function buildPhase(overrides: Partial<Phase> = {}): Phase {
  return {
    _id: "phase1",
    _creationTime: 1234567890,
    orchestrationId: "abc123",
    phaseNumber: "1",
    status: "planning",
    planPath: none<string>(),
    gitRange: none<string>(),
    planningMins: none<number>(),
    executionMins: none<number>(),
    reviewMins: none<number>(),
    startedAt: none<string>(),
    completedAt: none<string>(),
    ...overrides,
  }
}

export function buildTaskEvent(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return {
    _id: "task1",
    _creationTime: 1234567890,
    orchestrationId: "abc123",
    phaseNumber: some("1"),
    taskId: "1",
    subject: "Task 1",
    description: none<string>(),
    status: "pending",
    owner: none<string>(),
    blockedBy: none<string>(),
    metadata: none<string>(),
    recordedAt: "2024-01-01T10:00:00Z",
    ...overrides,
  }
}

export function buildTeamMember(
  overrides: Partial<TeamMember> = {},
): TeamMember {
  return {
    _id: "member1",
    _creationTime: 1234567890,
    orchestrationId: "abc123",
    phaseNumber: "1",
    agentName: "worker-1",
    agentType: none<string>(),
    model: none<string>(),
    joinedAt: none<string>(),
    recordedAt: "2024-01-01T10:00:00Z",
    ...overrides,
  }
}

export function buildOrchestrationDetail(
  overrides: Partial<OrchestrationDetail> = {},
): OrchestrationDetail {
  const phases = [
    buildPhase({
      _id: "phase1",
      orchestrationId: "abc123",
      phaseNumber: "1",
      status: "executing",
      planPath: some("/docs/plans/phase-1.md"),
      startedAt: some("2024-01-01T10:00:00Z"),
    }),
    buildPhase({
      _id: "phase2",
      _creationTime: 1234567891,
      orchestrationId: "abc123",
      phaseNumber: "2",
      status: "planning",
    }),
  ]

  return {
    _id: "abc123",
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

export function buildOrchestrationEvent(
  overrides: Partial<OrchestrationEvent> = {},
): OrchestrationEvent {
  return {
    _id: "event1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: some("1"),
    eventType: "phase_started",
    source: "tina-session",
    summary: "Phase started",
    detail: none<string>(),
    recordedAt: "2024-01-01T10:00:00Z",
    ...overrides,
  }
}

export function buildTaskListDetail(
  overrides: Partial<OrchestrationDetail> = {},
): OrchestrationDetail {
  const phase1 = buildPhase({
    _id: "phase1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: "1",
    status: "executing",
    planPath: some("/path/to/plan1.md"),
    planningMins: some(10),
    executionMins: some(20),
    startedAt: some("2024-01-01T10:00:00Z"),
  })

  const phase2 = buildPhase({
    _id: "phase2",
    _creationTime: 1234567891,
    orchestrationId: "orch1",
    phaseNumber: "2",
    status: "planning",
  })

  const phaseOneTasks = [
    buildTaskEvent({
      _id: "task1",
      orchestrationId: "orch1",
      phaseNumber: some("1"),
      taskId: "1",
      subject: "Implement feature A",
      description: some("Description for task 1"),
      status: "completed",
      owner: some("worker1"),
      recordedAt: "2024-01-01T10:00:00Z",
    }),
    buildTaskEvent({
      _id: "task2",
      _creationTime: 1234567891,
      orchestrationId: "orch1",
      phaseNumber: some("1"),
      taskId: "2",
      subject: "Write tests for feature A",
      description: some("Description for task 2"),
      status: "in_progress",
      owner: some("worker2"),
      recordedAt: "2024-01-01T10:05:00Z",
    }),
    buildTaskEvent({
      _id: "task3",
      _creationTime: 1234567892,
      orchestrationId: "orch1",
      phaseNumber: some("1"),
      taskId: "3",
      subject: "Review implementation",
      description: some("Description for task 3"),
      blockedBy: some("Task 2 must complete first"),
      recordedAt: "2024-01-01T10:10:00Z",
    }),
  ]

  return buildOrchestrationDetail({
    _id: "orch1",
    _creationTime: 1234567890,
    nodeId: "node1",
    featureName: "test-feature",
    designDocPath: "/docs/test.md",
    branch: "tina/test-feature",
    worktreePath: none<string>(),
    totalPhases: 3,
    currentPhase: 1,
    status: "executing",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: none<string>(),
    totalElapsedMins: none<number>(),
    nodeName: "test-node",
    phases: [phase1, phase2],
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
  const phase1 = buildPhase({
    _id: "phase1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: "1",
    status: "executing",
    planPath: some("/path/to/plan1.md"),
    planningMins: some(10),
    executionMins: some(20),
    startedAt: some("2024-01-01T10:00:00Z"),
  })

  const phase2 = buildPhase({
    _id: "phase2",
    _creationTime: 1234567891,
    orchestrationId: "orch1",
    phaseNumber: "2",
    status: "planning",
  })

  const phase3 = buildPhase({
    _id: "phase3",
    _creationTime: 1234567892,
    orchestrationId: "orch1",
    phaseNumber: "3",
    status: "pending",
  })

  return buildOrchestrationDetail({
    _id: "orch1",
    _creationTime: 1234567890,
    nodeId: "node1",
    featureName: "test-feature",
    designDocPath: "/docs/test.md",
    branch: "tina/test-feature",
    worktreePath: none<string>(),
    totalPhases: 3,
    currentPhase: 1,
    status: "executing",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: none<string>(),
    totalElapsedMins: none<number>(),
    nodeName: "test-node",
    phases: [phase1, phase2, phase3],
    phaseTasks: {
      "1": [
        buildTaskEvent({
          _id: "task1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: some("1"),
          taskId: "1",
          subject: "Task 1",
          description: some("Description 1"),
          status: "completed",
          owner: some("worker1"),
          recordedAt: "2024-01-01T10:00:00Z",
        }),
        buildTaskEvent({
          _id: "task2",
          _creationTime: 1234567891,
          orchestrationId: "orch1",
          phaseNumber: some("1"),
          taskId: "2",
          subject: "Task 2",
          description: some("Description 2"),
          status: "in_progress",
          owner: some("worker2"),
          recordedAt: "2024-01-01T10:05:00Z",
        }),
      ],
      "2": [],
    },
    teamMembers: [
      buildTeamMember({
        _id: "member1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: "1",
        agentName: "worker1",
        agentType: some("implementer"),
        model: some("sonnet"),
        joinedAt: some("2024-01-01T10:00:00Z"),
        recordedAt: "2024-01-01T10:00:00Z",
      }),
      buildTeamMember({
        _id: "member2",
        _creationTime: 1234567891,
        orchestrationId: "orch1",
        phaseNumber: "1",
        agentName: "worker2",
        agentType: some("reviewer"),
        model: some("sonnet"),
        joinedAt: some("2024-01-01T10:05:00Z"),
        recordedAt: "2024-01-01T10:05:00Z",
      }),
    ],
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

export function buildAppIntegrationFixture(
  overrides: AppIntegrationFixtureOverrides = {},
): AppIntegrationFixture {
  const projects = overrides.projects ?? [buildProjectSummary()]
  const orchestrations =
    overrides.orchestrations ?? [buildOrchestrationSummary()]
  const phases =
    overrides.phases ?? [
      buildPhase({
        _id: "phase1",
        orchestrationId: "abc123",
        phaseNumber: "1",
        status: "completed",
        planPath: some("/docs/plans/phase-1.md"),
        gitRange: some("abc..def"),
        planningMins: some(10),
        executionMins: some(20),
        reviewMins: some(5),
        startedAt: some("2024-01-01T10:00:00Z"),
        completedAt: some("2024-01-01T10:35:00Z"),
      }),
      buildPhase({
        _id: "phase2",
        _creationTime: 1234567891,
        orchestrationId: "abc123",
        phaseNumber: "2",
        status: "executing",
        planPath: some("/docs/plans/phase-2.md"),
        planningMins: some(15),
        startedAt: some("2024-01-01T10:40:00Z"),
      }),
      buildPhase({
        _id: "phase3",
        _creationTime: 1234567892,
        orchestrationId: "abc123",
        phaseNumber: "3",
        status: "pending",
      }),
    ]

  const detail = buildOrchestrationDetail({
    _id: "abc123",
    _creationTime: 1234567890,
    nodeId: "n1",
    featureName: "my-feature",
    designDocPath: "/docs/my-feature.md",
    branch: "tina/my-feature",
    worktreePath: none<string>(),
    totalPhases: 3,
    currentPhase: 2,
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
    ...overrides.detail,
  })

  return {
    projects,
    orchestrations,
    phases,
    detail,
  }
}
