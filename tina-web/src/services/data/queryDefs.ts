import { Schema } from "effect"
import { api } from "@convex/_generated/api"
import {
  OrchestrationSummary,
  OrchestrationDetail,
  ProjectSummary,
  OrchestrationEvent,
  Commit,
  Plan,
  TelemetrySpan,
  TelemetryEvent,
  TelemetryRollup,
} from "@/schemas"

export interface QueryDef<A = unknown, Args = Record<string, never>> {
  key: string
  query: unknown // Convex FunctionReference — typed at use site
  args: Schema.Schema<Args>
  schema: Schema.Schema<A, any, never>
}

function queryDef<A, Args = Record<string, never>>(def: QueryDef<A, Args>): QueryDef<A, Args> {
  return def
}

export const OrchestrationListQuery = queryDef({
  key: "orchestrations.list",
  query: api.orchestrations.listOrchestrations,
  args: Schema.Struct({}),
  schema: Schema.Array(OrchestrationSummary),
})

export const OrchestrationDetailQuery = queryDef({
  key: "orchestrations.detail",
  query: api.orchestrations.getOrchestrationDetail,
  args: Schema.Struct({ orchestrationId: Schema.String }),
  schema: Schema.NullOr(OrchestrationDetail),
})

export const ProjectListQuery = queryDef({
  key: "projects.list",
  query: api.projects.listProjects,
  args: Schema.Struct({}),
  schema: Schema.Array(ProjectSummary),
})

export const EventListQuery = queryDef({
  key: "events.list",
  query: api.events.listEvents,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    eventType: Schema.optional(Schema.String),
    since: Schema.optional(Schema.String),
    limit: Schema.optional(Schema.Number),
  }),
  schema: Schema.Array(OrchestrationEvent),
})

export const CommitListQuery = queryDef({
  key: "commits.list",
  query: api.commits.listCommits,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    phaseNumber: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(Commit),
})

export const PlanQuery = queryDef({
  key: "plans.get",
  query: api.plans.getPlan,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    phaseNumber: Schema.String,
  }),
  schema: Schema.NullOr(Plan),
})

export const TelemetrySpanListQuery = queryDef({
  key: "telemetry.spans",
  query: api.telemetry.listSpans,
  args: Schema.Struct({
    traceId: Schema.optional(Schema.String),
    orchestrationId: Schema.optional(Schema.String),
    source: Schema.optional(Schema.String),
    operation: Schema.optional(Schema.String),
    since: Schema.optional(Schema.String),
    limit: Schema.optional(Schema.Number),
  }),
  schema: Schema.Array(TelemetrySpan),
})

export const TelemetryEventListQuery = queryDef({
  key: "telemetry.events",
  query: api.telemetry.listEvents,
  args: Schema.Struct({
    traceId: Schema.optional(Schema.String),
    orchestrationId: Schema.optional(Schema.String),
    eventType: Schema.optional(Schema.String),
    source: Schema.optional(Schema.String),
    since: Schema.optional(Schema.String),
    limit: Schema.optional(Schema.Number),
  }),
  schema: Schema.Array(TelemetryEvent),
})

export const TelemetryRollupQuery = queryDef({
  key: "telemetry.rollups",
  query: api.telemetry.getRollups,
  args: Schema.Struct({
    windowStart: Schema.String,
    windowEnd: Schema.String,
    source: Schema.optional(Schema.String),
    operation: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(TelemetryRollup),
})
