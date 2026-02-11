import { describe, it, expect } from "vitest"
import { Schema } from "effect"
import {
  OrchestrationListQuery,
  OrchestrationDetailQuery,
  ProjectListQuery,
  EventListQuery,
  TelemetrySpanListQuery,
  TelemetryEventListQuery,
  TelemetryRollupQuery,
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

  describe("TelemetrySpanListQuery", () => {
    it("has key, query reference, args schema, and result schema", () => {
      expectQueryMeta(TelemetrySpanListQuery, "telemetry.spans")
    })

    it("args schema accepts optional filters", () => {
      const decoded = decode(TelemetrySpanListQuery.args, {
        traceId: "trace123",
        orchestrationId: "orch123",
        source: "tina-session",
        operation: "advance_phase",
        since: "2024-01-01T00:00:00Z",
        limit: 50,
      })
      expect(decoded.traceId).toBe("trace123")
      expect(decoded.orchestrationId).toBe("orch123")
      expect(decoded.source).toBe("tina-session")
      expect(decoded.operation).toBe("advance_phase")
      expect(decoded.since).toBe("2024-01-01T00:00:00Z")
      expect(decoded.limit).toBe(50)
    })

    it("args schema accepts empty args", () => {
      const decoded = decode(TelemetrySpanListQuery.args, {})
      expect(decoded).toEqual({})
    })

    it("schema decodes valid span list data", () => {
      const decoded = decode(TelemetrySpanListQuery.schema, [
        {
          _id: "span123",
          _creationTime: 1234567890,
          traceId: "trace123",
          spanId: "span123",
          parentSpanId: undefined,
          orchestrationId: "orch123",
          featureName: "test-feature",
          phaseNumber: "1",
          teamName: undefined,
          taskId: undefined,
          source: "tina-session",
          operation: "advance_phase",
          startedAt: "2024-01-01T00:00:00Z",
          endedAt: "2024-01-01T00:01:00Z",
          durationMs: 60000,
          status: "ok",
          errorCode: undefined,
          errorDetail: undefined,
          attrs: undefined,
          recordedAt: "2024-01-01T00:01:00Z",
        },
      ])

      expect(decoded).toHaveLength(1)
      expect(decoded[0].traceId).toBe("trace123")
      expect(decoded[0].operation).toBe("advance_phase")
    })

    it("schema rejects invalid span data", () => {
      expectDecodeThrows(TelemetrySpanListQuery.schema, [{ spanId: 123 }])
    })
  })

  describe("TelemetryEventListQuery", () => {
    it("has key, query reference, args schema, and result schema", () => {
      expectQueryMeta(TelemetryEventListQuery, "telemetry.events")
    })

    it("args schema accepts optional filters", () => {
      const decoded = decode(TelemetryEventListQuery.args, {
        traceId: "trace123",
        orchestrationId: "orch123",
        eventType: "span.error",
        source: "tina-daemon",
        since: "2024-01-01T00:00:00Z",
        limit: 50,
      })
      expect(decoded.traceId).toBe("trace123")
      expect(decoded.orchestrationId).toBe("orch123")
      expect(decoded.eventType).toBe("span.error")
      expect(decoded.source).toBe("tina-daemon")
      expect(decoded.since).toBe("2024-01-01T00:00:00Z")
      expect(decoded.limit).toBe(50)
    })

    it("args schema accepts empty args", () => {
      const decoded = decode(TelemetryEventListQuery.args, {})
      expect(decoded).toEqual({})
    })

    it("schema decodes valid event list data", () => {
      const decoded = decode(TelemetryEventListQuery.schema, [
        {
          _id: "evt123",
          _creationTime: 1234567890,
          traceId: "trace123",
          spanId: "span123",
          parentSpanId: undefined,
          orchestrationId: "orch123",
          featureName: "test-feature",
          phaseNumber: "1",
          teamName: undefined,
          taskId: undefined,
          source: "tina-daemon",
          eventType: "span.error",
          severity: "error",
          message: "Sync failed",
          status: undefined,
          attrs: undefined,
          recordedAt: "2024-01-01T00:00:00Z",
        },
      ])

      expect(decoded).toHaveLength(1)
      expect(decoded[0].traceId).toBe("trace123")
      expect(decoded[0].eventType).toBe("span.error")
    })

    it("schema rejects invalid event data", () => {
      expectDecodeThrows(TelemetryEventListQuery.schema, [{ eventType: 123 }])
    })
  })

  describe("TelemetryRollupQuery", () => {
    it("has key, query reference, args schema, and result schema", () => {
      expectQueryMeta(TelemetryRollupQuery, "telemetry.rollups")
    })

    it("args schema requires windowStart and windowEnd", () => {
      const decoded = decode(TelemetryRollupQuery.args, {
        windowStart: "2024-01-01T00:00:00Z",
        windowEnd: "2024-01-01T01:00:00Z",
      })
      expect(decoded.windowStart).toBe("2024-01-01T00:00:00Z")
      expect(decoded.windowEnd).toBe("2024-01-01T01:00:00Z")
    })

    it("args schema accepts optional source and operation", () => {
      const decoded = decode(TelemetryRollupQuery.args, {
        windowStart: "2024-01-01T00:00:00Z",
        windowEnd: "2024-01-01T01:00:00Z",
        source: "tina-session",
        operation: "advance_phase",
      })
      expect(decoded.source).toBe("tina-session")
      expect(decoded.operation).toBe("advance_phase")
    })

    it("args schema rejects missing windowStart", () => {
      expectDecodeThrows(TelemetryRollupQuery.args, {
        windowEnd: "2024-01-01T01:00:00Z",
      })
    })

    it("args schema rejects missing windowEnd", () => {
      expectDecodeThrows(TelemetryRollupQuery.args, {
        windowStart: "2024-01-01T00:00:00Z",
      })
    })

    it("schema decodes valid rollup list data", () => {
      const decoded = decode(TelemetryRollupQuery.schema, [
        {
          _id: "rollup123",
          _creationTime: 1234567890,
          windowStart: "2024-01-01T00:00:00Z",
          windowEnd: "2024-01-01T01:00:00Z",
          granularityMin: 60,
          source: "tina-session",
          operation: "advance_phase",
          orchestrationId: "orch123",
          phaseNumber: "1",
          spanCount: 10,
          errorCount: 0,
          eventCount: 5,
          p95DurationMs: 1500,
          maxDurationMs: 2000,
        },
      ])

      expect(decoded).toHaveLength(1)
      expect(decoded[0].source).toBe("tina-session")
      expect(decoded[0].spanCount).toBe(10)
    })

    it("schema rejects invalid rollup data", () => {
      expectDecodeThrows(TelemetryRollupQuery.schema, [{ spanCount: "not-a-number" }])
    })
  })
})
