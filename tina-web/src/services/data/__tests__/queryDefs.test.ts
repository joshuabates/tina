import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import {
  OrchestrationListQuery,
  OrchestrationDetailQuery,
  ProjectListQuery,
  EventListQuery,
} from "../queryDefs"

function decode<A, I>(schema: Schema.Schema<A, I>, input: unknown): A {
  return Schema.decodeUnknownSync(schema)(input)
}

function expectDecodeThrows(schema: Schema.Schema<any, any>, input: unknown) {
  expect(() => decode(schema, input)).toThrow()
}

function expectQueryMeta(
  query: { key: string; query: unknown; args: unknown; schema: unknown },
  key: string,
) {
  expect(query.key).toBe(key)
  expect(query.query).toBeDefined()
  expect(query.args).toBeDefined()
  expect(query.schema).toBeDefined()
}

describe("queryDefs", () => {
  describe("OrchestrationListQuery", () => {
    it("has key, query reference, and schema", () => {
      expectQueryMeta(OrchestrationListQuery, "orchestrations.list")
    })

    it("schema decodes valid orchestration list data", () => {
      const decoded = decode(OrchestrationListQuery.schema, [
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
      ])

      expect(decoded).toHaveLength(1)
      expect(decoded[0]._id).toBe("orch123")
    })

    it("schema rejects invalid orchestration list data", () => {
      expectDecodeThrows(OrchestrationListQuery.schema, [{ invalid: "data" }])
    })
  })

  describe("OrchestrationDetailQuery", () => {
    it("has key, query reference, args schema, and result schema", () => {
      expectQueryMeta(OrchestrationDetailQuery, "orchestrations.detail")
    })

    it("args schema requires orchestrationId", () => {
      const decoded = decode(OrchestrationDetailQuery.args, { orchestrationId: "orch123" })
      expect(decoded.orchestrationId).toBe("orch123")
    })

    it("args schema rejects missing orchestrationId", () => {
      expectDecodeThrows(OrchestrationDetailQuery.args, {})
    })

    it("schema decodes valid orchestration detail data", () => {
      const decoded = decode(OrchestrationDetailQuery.schema, {
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
      })

      expect(decoded).not.toBeNull()
      expect(decoded!._id).toBe("orch123")
      expect(decoded!.phases).toEqual([])
      expect(decoded!.teamMembers).toEqual([])
    })
  })

  describe("ProjectListQuery", () => {
    it("has key, query reference, and schema", () => {
      expectQueryMeta(ProjectListQuery, "projects.list")
    })

    it("schema decodes valid project list data", () => {
      const decoded = decode(ProjectListQuery.schema, [
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
      ])

      expect(decoded).toHaveLength(1)
      expect(decoded[0].name).toBe("Test Project")
    })

    it("schema rejects invalid project data", () => {
      expectDecodeThrows(ProjectListQuery.schema, [{ name: 123 }])
    })
  })

  describe("EventListQuery", () => {
    it("has key, query reference, args schema, and result schema", () => {
      expectQueryMeta(EventListQuery, "events.list")
    })

    it("args schema requires orchestrationId", () => {
      const decoded = decode(EventListQuery.args, { orchestrationId: "orch123" })
      expect(decoded.orchestrationId).toBe("orch123")
    })

    it("args schema accepts optional since and limit", () => {
      const decoded = decode(EventListQuery.args, {
        orchestrationId: "orch123",
        since: "2024-01-01T00:00:00Z",
        limit: 50,
      })
      expect(decoded.since).toBe("2024-01-01T00:00:00Z")
      expect(decoded.limit).toBe(50)
    })

    it("schema decodes valid event list data", () => {
      const decoded = decode(EventListQuery.schema, [
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
      ])

      expect(decoded).toHaveLength(1)
      expect(decoded[0].eventType).toBe("PhaseStarted")
    })

    it("schema rejects invalid event data", () => {
      expectDecodeThrows(EventListQuery.schema, [{ eventType: 123 }])
    })
  })
})
