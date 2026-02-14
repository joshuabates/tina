import type {
  DesignSummary,
  OrchestrationEvent,
  OrchestrationSummary,
  Phase,
  ProjectSummary,
  ReviewCheck,
  ReviewGate,
  ReviewSummary,
  ReviewThread,
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
    policyRevision: none<number>(),
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
    tmuxPaneId: none<string>(),
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

export function buildDesignSummary(
  overrides: Partial<DesignSummary> = {},
): DesignSummary {
  return {
    _id: "d1",
    _creationTime: 1234567890,
    projectId: "p1",
    designKey: "ALPHA-D1",
    title: "Authentication Flow",
    markdown: "# Auth\nDesign for auth flow",
    status: "draft",
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z",
    archivedAt: none<string>(),
    complexityPreset: none<string>(),
    requiredMarkers: none<string[]>(),
    completedMarkers: none<string[]>(),
    phaseCount: none<number>(),
    phaseStructureValid: none<boolean>(),
    validationUpdatedAt: none<string>(),
    ...overrides,
  }
}

export function buildReviewSummary(
  overrides: Partial<ReviewSummary> = {},
): ReviewSummary {
  return {
    _id: "rev1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: some("1"),
    state: "open",
    reviewerAgent: "test-review-agent",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: none<string>(),
    ...overrides,
  }
}

export function buildReviewThread(
  overrides: Partial<ReviewThread> = {},
): ReviewThread {
  return {
    _id: "thread1",
    _creationTime: 1234567890,
    reviewId: "rev1",
    orchestrationId: "orch1",
    filePath: "src/foo.ts",
    line: 42,
    commitSha: "abc123",
    summary: "Test finding",
    body: "Detailed explanation of the finding",
    severity: "p1",
    status: "unresolved",
    source: "agent",
    author: "review-agent",
    gateImpact: "review",
    createdAt: "2024-01-01T10:00:00Z",
    resolvedAt: none<string>(),
    resolvedBy: none<string>(),
    ...overrides,
  }
}

export function buildReviewGate(
  overrides: Partial<ReviewGate> = {},
): ReviewGate {
  return {
    _id: "gate1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    gateId: "review",
    status: "pending",
    owner: "orchestrator",
    decidedBy: none<string>(),
    decidedAt: none<string>(),
    summary: "Awaiting review",
    ...overrides,
  }
}

export function buildReviewCheck(
  overrides: Partial<ReviewCheck> = {},
): ReviewCheck {
  return {
    _id: "check1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    reviewId: "rev1",
    name: "typecheck",
    kind: "cli",
    command: some("mise typecheck"),
    status: "passed",
    comment: none<string>(),
    output: none<string>(),
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: some("2024-01-01T10:00:04Z"),
    durationMs: some(4200),
    ...overrides,
  }
}

