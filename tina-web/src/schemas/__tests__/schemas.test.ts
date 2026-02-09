import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import { OrchestrationSummary } from "../orchestration"
import { ProjectSummary } from "../project"
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
      // projectId, worktreePath, completedAt, totalElapsedMins all absent
    }

    const result = Schema.decodeUnknownSync(OrchestrationSummary)(raw)
    expect(result.featureName).toBe("test-feature")
  })
})

describe("ProjectSummary schema", () => {
  it("decodes a project with null optional fields", () => {
    const raw = {
      _id: "proj1",
      _creationTime: 1700000000000,
      name: "my-project",
      repoPath: "/Users/dev/project",
      createdAt: "2026-02-09T00:00:00Z",
      orchestrationCount: 5,
      latestFeature: null,
      latestStatus: null,
    }

    const result = Schema.decodeUnknownSync(ProjectSummary)(raw)
    expect(result.name).toBe("my-project")
    expect(result.latestFeature).toBeNull()
  })

  it("decodes a project with populated optional fields", () => {
    const raw = {
      _id: "proj1",
      _creationTime: 1700000000000,
      name: "my-project",
      repoPath: "/Users/dev/project",
      createdAt: "2026-02-09T00:00:00Z",
      orchestrationCount: 5,
      latestFeature: "auth-system",
      latestStatus: "executing",
    }

    const result = Schema.decodeUnknownSync(ProjectSummary)(raw)
    expect(result.latestFeature).toBe("auth-system")
    expect(result.latestStatus).toBe("executing")
  })
})

describe("OrchestrationDetail schema", () => {
  it("decodes a full detail payload with nested arrays", () => {
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
          _id: "phase1",
          _creationTime: 1700000000000,
          orchestrationId: "orch1",
          phaseNumber: "1",
          status: "complete",
        },
      ],
      tasks: [],
      orchestratorTasks: [],
      phaseTasks: {},
      teamMembers: [
        {
          _id: "tm1",
          _creationTime: 1700000000000,
          orchestrationId: "orch1",
          phaseNumber: "1",
          agentName: "worker-1",
          recordedAt: "2026-02-09T00:00:00Z",
        },
      ],
    }

    const result = Schema.decodeUnknownSync(OrchestrationDetail)(raw)
    expect(result.phases).toHaveLength(1)
    expect(result.teamMembers).toHaveLength(1)
    expect(result.teamMembers[0].agentName).toBe("worker-1")
  })
})
