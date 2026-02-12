import type {
  OrchestrationEvent,
  OrchestrationSummary,
  Phase,
  ProjectSummary,
  TaskEvent,
  TeamMember,
} from "@/schemas"
import { none, some } from "./primitives"

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
    policySnapshot: none<string>(),
    policySnapshotHash: none<string>(),
    presetOrigin: none<string>(),
    designOnly: none<boolean>(),
    updatedAt: none<string>(),
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
