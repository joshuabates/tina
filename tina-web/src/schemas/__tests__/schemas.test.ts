import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { OrchestrationSummary } from "../orchestration"
import { Phase } from "../phase"
import { TaskEvent } from "../task"
import { TeamMember } from "../team"
import { ProjectSummary } from "../project"
import { OrchestrationEvent } from "../event"
import { OrchestrationDetail } from "../detail"

describe("OrchestrationSummary schema", () => {
  it("decodes a valid orchestration payload", () => {
    const raw = {
      _id: "abc123",
      _creationTime: 1700000000000,
      nodeId: "node1",
      featureName: "test-feature",
      designDocPath: "/path/to/design.md",
      branch: "tina/test-feature",
      totalPhases: 3,
      currentPhase: 1,
      status: "executing",
      startedAt: "2026-02-09T00:00:00Z",
      nodeName: "dev-machine",
    }

    const result = Schema.decodeUnknownSync(OrchestrationSummary)(raw)
    expect(result.featureName).toBe("test-feature")
    expect(result.nodeName).toBe("dev-machine")
  })

  it("rejects a payload missing required fields", () => {
    const raw = { _id: "abc123" }
    expect(() => Schema.decodeUnknownSync(OrchestrationSummary)(raw)).toThrow()
  })

  it("accepts optional fields as undefined", () => {
    const raw = {
      _id: "abc123",
      _creationTime: 1700000000000,
      nodeId: "node1",
      featureName: "test-feature",
      designDocPath: "/path/to/design.md",
      branch: "tina/test-feature",
      totalPhases: 3,
      currentPhase: 1,
      status: "executing",
      startedAt: "2026-02-09T00:00:00Z",
      nodeName: "dev-machine",
    }

    const result = Schema.decodeUnknownSync(OrchestrationSummary)(raw)
    expect(result.featureName).toBe("test-feature")
  })
})

describe("Phase schema", () => {
  it("decodes a valid phase payload", () => {
    const raw = {
      _id: "phase1",
      _creationTime: 1700000000000,
      orchestrationId: "orch1",
      phaseNumber: "1",
      status: "executing",
    }

    const result = Schema.decodeUnknownSync(Phase)(raw)
    expect(result.phaseNumber).toBe("1")
  })
})

describe("TaskEvent schema", () => {
  it("decodes a valid task event payload", () => {
    const raw = {
      _id: "task1",
      _creationTime: 1700000000000,
      orchestrationId: "orch1",
      taskId: "t-1",
      subject: "Implement feature",
      status: "in_progress",
      recordedAt: "2026-02-09T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(TaskEvent)(raw)
    expect(result.subject).toBe("Implement feature")
  })
})

describe("TeamMember schema", () => {
  it("decodes a valid team member payload", () => {
    const raw = {
      _id: "tm1",
      _creationTime: 1700000000000,
      orchestrationId: "orch1",
      phaseNumber: "1",
      agentName: "executor",
      recordedAt: "2026-02-09T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(TeamMember)(raw)
    expect(result.agentName).toBe("executor")
  })
})

describe("ProjectSummary schema", () => {
  it("decodes with null fields", () => {
    const raw = {
      _id: "proj1",
      _creationTime: 1700000000000,
      name: "tina",
      repoPath: "/path/to/repo",
      createdAt: "2026-02-09T00:00:00Z",
      orchestrationCount: 5,
      latestFeature: null,
      latestStatus: null,
    }

    const result = Schema.decodeUnknownSync(ProjectSummary)(raw)
    expect(result.name).toBe("tina")
    expect(result.latestFeature).toBeNull()
  })

  it("decodes with string fields", () => {
    const raw = {
      _id: "proj1",
      _creationTime: 1700000000000,
      name: "tina",
      repoPath: "/path/to/repo",
      createdAt: "2026-02-09T00:00:00Z",
      orchestrationCount: 5,
      latestFeature: "web-rebuild",
      latestStatus: "executing",
    }

    const result = Schema.decodeUnknownSync(ProjectSummary)(raw)
    expect(result.latestFeature).toBe("web-rebuild")
  })
})

describe("OrchestrationEvent schema", () => {
  it("decodes a valid event payload", () => {
    const raw = {
      _id: "evt1",
      _creationTime: 1700000000000,
      orchestrationId: "orch1",
      eventType: "phase_review_complete",
      source: "reviewer",
      summary: "Phase 1 review passed",
      recordedAt: "2026-02-09T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(OrchestrationEvent)(raw)
    expect(result.eventType).toBe("phase_review_complete")
  })
})

describe("OrchestrationDetail schema", () => {
  it("decodes a full detail payload", () => {
    const raw = {
      _id: "orch1",
      _creationTime: 1700000000000,
      nodeId: "node1",
      featureName: "test-feature",
      designDocPath: "/path/to/design.md",
      branch: "tina/test-feature",
      totalPhases: 2,
      currentPhase: 1,
      status: "executing",
      startedAt: "2026-02-09T00:00:00Z",
      nodeName: "dev-machine",
      phases: [
        {
          _id: "p1",
          _creationTime: 1700000000000,
          orchestrationId: "orch1",
          phaseNumber: "1",
          status: "executing",
        },
      ],
      tasks: [
        {
          _id: "t1",
          _creationTime: 1700000000000,
          orchestrationId: "orch1",
          taskId: "t-1",
          subject: "Do thing",
          status: "pending",
          recordedAt: "2026-02-09T00:00:00Z",
        },
      ],
      orchestratorTasks: [],
      phaseTasks: {
        "1": [
          {
            _id: "t1",
            _creationTime: 1700000000000,
            orchestrationId: "orch1",
            taskId: "t-1",
            subject: "Do thing",
            status: "pending",
            recordedAt: "2026-02-09T00:00:00Z",
          },
        ],
      },
      teamMembers: [
        {
          _id: "tm1",
          _creationTime: 1700000000000,
          orchestrationId: "orch1",
          phaseNumber: "1",
          agentName: "executor",
          recordedAt: "2026-02-09T00:00:00Z",
        },
      ],
    }

    const result = Schema.decodeUnknownSync(OrchestrationDetail)(raw)
    expect(result.featureName).toBe("test-feature")
    expect(result.phases).toHaveLength(1)
    expect(result.teamMembers).toHaveLength(1)
  })
})
