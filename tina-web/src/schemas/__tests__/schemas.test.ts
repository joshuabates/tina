import { describe, it, expect } from "vitest"
import { Schema, Option } from "effect"
import { OrchestrationSummary } from "../orchestration"
import { ProjectSummary } from "../project"
import { OrchestrationDetail } from "../detail"
import { DesignSummary } from "../design"
import { TicketSummary } from "../ticket"
import { WorkComment } from "../workComment"

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

describe("DesignSummary schema", () => {
  it("decodes a valid design payload", () => {
    const raw = {
      _id: "design1",
      _creationTime: 1700000000000,
      projectId: "proj1",
      designKey: "DES-1",
      title: "Auth System Design",
      markdown: "# Auth\nDesign content here",
      status: "draft",
      createdAt: "2026-02-09T00:00:00Z",
      updatedAt: "2026-02-09T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(DesignSummary)(raw)
    expect(result.designKey).toBe("DES-1")
    expect(result.title).toBe("Auth System Design")
    expect(result.status).toBe("draft")
    expect(Option.isNone(result.archivedAt)).toBe(true)
  })

  it("decodes a design with archivedAt present", () => {
    const raw = {
      _id: "design2",
      _creationTime: 1700000000000,
      projectId: "proj1",
      designKey: "DES-2",
      title: "Old Design",
      markdown: "# Old",
      status: "archived",
      createdAt: "2026-02-09T00:00:00Z",
      updatedAt: "2026-02-10T00:00:00Z",
      archivedAt: "2026-02-10T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(DesignSummary)(raw)
    expect(Option.isSome(result.archivedAt)).toBe(true)
    expect(Option.getOrThrow(result.archivedAt)).toBe("2026-02-10T00:00:00Z")
  })

  it("rejects a design missing required fields", () => {
    const raw = { _id: "design1", _creationTime: 1700000000000 }
    expect(() => Schema.decodeUnknownSync(DesignSummary)(raw)).toThrow()
  })
})

describe("TicketSummary schema", () => {
  it("decodes a valid ticket payload", () => {
    const raw = {
      _id: "ticket1",
      _creationTime: 1700000000000,
      projectId: "proj1",
      ticketKey: "TK-1",
      title: "Implement login",
      description: "Add login form",
      status: "todo",
      priority: "high",
      createdAt: "2026-02-09T00:00:00Z",
      updatedAt: "2026-02-09T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(TicketSummary)(raw)
    expect(result.ticketKey).toBe("TK-1")
    expect(result.priority).toBe("high")
    expect(Option.isNone(result.designId)).toBe(true)
    expect(Option.isNone(result.estimate)).toBe(true)
    expect(Option.isNone(result.closedAt)).toBe(true)
  })

  it("decodes a ticket with all optional fields present", () => {
    const raw = {
      _id: "ticket2",
      _creationTime: 1700000000000,
      projectId: "proj1",
      designId: "design1",
      ticketKey: "TK-2",
      title: "Fix bug",
      description: "Fix the login bug",
      status: "done",
      priority: "urgent",
      estimate: "2h",
      createdAt: "2026-02-09T00:00:00Z",
      updatedAt: "2026-02-10T00:00:00Z",
      closedAt: "2026-02-10T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(TicketSummary)(raw)
    expect(Option.getOrThrow(result.designId)).toBe("design1")
    expect(Option.getOrThrow(result.estimate)).toBe("2h")
    expect(Option.getOrThrow(result.closedAt)).toBe("2026-02-10T00:00:00Z")
  })

  it("rejects a ticket missing required fields", () => {
    const raw = { _id: "ticket1" }
    expect(() => Schema.decodeUnknownSync(TicketSummary)(raw)).toThrow()
  })
})

describe("WorkComment schema", () => {
  it("decodes a valid comment payload", () => {
    const raw = {
      _id: "comment1",
      _creationTime: 1700000000000,
      projectId: "proj1",
      targetType: "design",
      targetId: "design1",
      authorType: "human",
      authorName: "Joshua",
      body: "Looks good!",
      createdAt: "2026-02-09T00:00:00Z",
    }

    const result = Schema.decodeUnknownSync(WorkComment)(raw)
    expect(result.authorName).toBe("Joshua")
    expect(result.targetType).toBe("design")
    expect(Option.isNone(result.editedAt)).toBe(true)
  })

  it("decodes a comment with editedAt present", () => {
    const raw = {
      _id: "comment2",
      _creationTime: 1700000000000,
      projectId: "proj1",
      targetType: "ticket",
      targetId: "ticket1",
      authorType: "agent",
      authorName: "worker-1",
      body: "Updated description",
      createdAt: "2026-02-09T00:00:00Z",
      editedAt: "2026-02-09T01:00:00Z",
    }

    const result = Schema.decodeUnknownSync(WorkComment)(raw)
    expect(result.authorType).toBe("agent")
    expect(Option.getOrThrow(result.editedAt)).toBe("2026-02-09T01:00:00Z")
  })

  it("rejects a comment missing required fields", () => {
    const raw = { _id: "comment1", body: "text" }
    expect(() => Schema.decodeUnknownSync(WorkComment)(raw)).toThrow()
  })
})
