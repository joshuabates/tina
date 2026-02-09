import { Schema } from "effect"
import { api } from "@convex/_generated/api"
import {
  OrchestrationSummary,
  OrchestrationDetail,
  ProjectSummary,
  OrchestrationEvent,
} from "@/schemas"

export interface QueryDef<A, Args = Record<string, never>> {
  key: string
  query: unknown // Convex FunctionReference — typed at use site
  args: Schema.Schema<Args>
  schema: Schema.Schema<A>
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
  schema: OrchestrationDetail,
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
    since: Schema.optional(Schema.String),
    limit: Schema.optional(Schema.Number),
  }),
  schema: Schema.Array(OrchestrationEvent),
})
