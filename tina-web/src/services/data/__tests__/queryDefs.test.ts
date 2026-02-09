import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import {
  OrchestrationListQuery,
  OrchestrationDetailQuery,
  ProjectListQuery,
  EventListQuery,
} from "../queryDefs"

describe("queryDefs", () => {
  describe("OrchestrationListQuery", () => {
    it("has key, query reference, and schema", () => {
      expect(OrchestrationListQuery.key).toBe("orchestrations.list")
      expect(OrchestrationListQuery.query).toBeDefined()
      expect(OrchestrationListQuery.args).toBeDefined()
      expect(OrchestrationListQuery.schema).toBeDefined()
    })

    it("schema decodes valid orchestration list data", () => {
      const validData = [
        {
          _id: "orch123",
          _creationTime: 1234567890,
          nodeId: "node1",
          projectId: "proj1",
          featureName: "test-feature",
          designDocPath: "/path/to/doc.md",
          branch: "main",
          worktreePath: "/path/to/worktree",
          totalPhases: 3,
          currentPhase: 1,
          status: "Executing",
          startedAt: "2024-01-01T00:00:00Z",
          completedAt: undefined,
          totalElapsedMins: 10,
          nodeName: "test-node",
        },
      ]

      const decoded = Schema.decodeUnknownSync(OrchestrationListQuery.schema)(validData)
      expect(decoded).toHaveLength(1)
      expect(decoded[0]._id).toBe("orch123")
    })

    it("schema rejects invalid orchestration list data", () => {
      const invalidData = [{ invalid: "data" }]

      expect(() => {
        Schema.decodeUnknownSync(OrchestrationListQuery.schema)(invalidData)
      }).toThrow()
    })
  })

  describe("OrchestrationDetailQuery", () => {
    it("has key, query reference, args schema, and result schema", () => {
      expect(OrchestrationDetailQuery.key).toBe("orchestrations.detail")
      expect(OrchestrationDetailQuery.query).toBeDefined()
      expect(OrchestrationDetailQuery.args).toBeDefined()
      expect(OrchestrationDetailQuery.schema).toBeDefined()
    })

    it("args schema requires orchestrationId", () => {
      const validArgs = { orchestrationId: "orch123" }
      const decoded = Schema.decodeUnknownSync(OrchestrationDetailQuery.args)(validArgs)
      expect(decoded.orchestrationId).toBe("orch123")
    })

    it("args schema rejects missing orchestrationId", () => {
      const invalidArgs = {}
      expect(() => {
        Schema.decodeUnknownSync(OrchestrationDetailQuery.args)(invalidArgs)
      }).toThrow()
    })

    it("schema decodes valid orchestration detail data", () => {
      const validData = {
        _id: "orch123",
        _creationTime: 1234567890,
        nodeId: "node1",
        featureName: "test-feature",
        designDocPath: "/path/to/doc.md",
        branch: "main",
        worktreePath: "/path/to/worktree",
        totalPhases: 3,
        currentPhase: 1,
        status: "Executing",
        startedAt: "2024-01-01T00:00:00Z",
        completedAt: undefined,
        totalElapsedMins: 10,
        nodeName: "test-node",
        phases: [],
        tasks: [],
        orchestratorTasks: [],
        phaseTasks: {},
        teamMembers: [],
      }

      const decoded = Schema.decodeUnknownSync(OrchestrationDetailQuery.schema)(validData)
      expect(decoded._id).toBe("orch123")
      expect(decoded.phases).toEqual([])
      expect(decoded.teamMembers).toEqual([])
    })
  })

  describe("ProjectListQuery", () => {
    it("has key, query reference, and schema", () => {
      expect(ProjectListQuery.key).toBe("projects.list")
      expect(ProjectListQuery.query).toBeDefined()
      expect(ProjectListQuery.args).toBeDefined()
      expect(ProjectListQuery.schema).toBeDefined()
    })

    it("schema decodes valid project list data", () => {
      const validData = [
        {
          _id: "proj123",
          _creationTime: 1234567890,
          name: "Test Project",
          repoPath: "/path/to/project",
          createdAt: "2024-01-01T00:00:00Z",
          orchestrationCount: 5,
          latestFeature: "test-feature",
          latestStatus: "Executing",
        },
      ]

      const decoded = Schema.decodeUnknownSync(ProjectListQuery.schema)(validData)
      expect(decoded).toHaveLength(1)
      expect(decoded[0].name).toBe("Test Project")
    })

    it("schema rejects invalid project data", () => {
      const invalidData = [{ name: 123 }]

      expect(() => {
        Schema.decodeUnknownSync(ProjectListQuery.schema)(invalidData)
      }).toThrow()
    })
  })

  describe("EventListQuery", () => {
    it("has key, query reference, args schema, and result schema", () => {
      expect(EventListQuery.key).toBe("events.list")
      expect(EventListQuery.query).toBeDefined()
      expect(EventListQuery.args).toBeDefined()
      expect(EventListQuery.schema).toBeDefined()
    })

    it("args schema requires orchestrationId", () => {
      const validArgs = { orchestrationId: "orch123" }
      const decoded = Schema.decodeUnknownSync(EventListQuery.args)(validArgs)
      expect(decoded.orchestrationId).toBe("orch123")
    })

    it("args schema accepts optional since and limit", () => {
      const validArgs = {
        orchestrationId: "orch123",
        since: "2024-01-01T00:00:00Z",
        limit: 50,
      }
      const decoded = Schema.decodeUnknownSync(EventListQuery.args)(validArgs)
      expect(decoded.since).toBe("2024-01-01T00:00:00Z")
      expect(decoded.limit).toBe(50)
    })

    it("schema decodes valid event list data", () => {
      const validData = [
        {
          _id: "evt123",
          _creationTime: 1234567890,
          orchestrationId: "orch123",
          phaseNumber: "1",
          eventType: "PhaseStarted",
          source: "system",
          summary: "Phase 1 started",
          detail: "Starting phase 1",
          recordedAt: "2024-01-01T00:00:00Z",
        },
      ]

      const decoded = Schema.decodeUnknownSync(EventListQuery.schema)(validData)
      expect(decoded).toHaveLength(1)
      expect(decoded[0].eventType).toBe("PhaseStarted")
    })

    it("schema rejects invalid event data", () => {
      const invalidData = [{ eventType: 123 }]

      expect(() => {
        Schema.decodeUnknownSync(EventListQuery.schema)(invalidData)
      }).toThrow()
    })
  })
})
