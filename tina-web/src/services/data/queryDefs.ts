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
  DesignSummary,
  TicketSummary,
  WorkComment,
  NodeSummary,
  TimelineEntry,
  ReviewSummary,
  ReviewThread,
  ReviewGate,
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

export const DesignListQuery = queryDef({
  key: "designs.list",
  query: api.designs.listDesigns,
  args: Schema.Struct({
    projectId: Schema.String,
    status: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(DesignSummary),
})

export const DesignDetailQuery = queryDef({
  key: "designs.get",
  query: api.designs.getDesign,
  args: Schema.Struct({ designId: Schema.String }),
  schema: Schema.NullOr(DesignSummary),
})

export const TicketListQuery = queryDef({
  key: "tickets.list",
  query: api.tickets.listTickets,
  args: Schema.Struct({
    projectId: Schema.String,
    status: Schema.optional(Schema.String),
    designId: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(TicketSummary),
})

export const TicketDetailQuery = queryDef({
  key: "tickets.get",
  query: api.tickets.getTicket,
  args: Schema.Struct({ ticketId: Schema.String }),
  schema: Schema.NullOr(TicketSummary),
})

export const CommentListQuery = queryDef({
  key: "workComments.list",
  query: api.workComments.listComments,
  args: Schema.Struct({
    targetType: Schema.String,
    targetId: Schema.String,
  }),
  schema: Schema.Array(WorkComment),
})

export const NodeListQuery = queryDef({
  key: "nodes.list",
  query: api.nodes.listNodes,
  args: Schema.Struct({}),
  schema: Schema.Array(NodeSummary),
})

export const TimelineQuery = queryDef({
  key: "timeline.unified",
  query: api.timeline.getUnifiedTimeline,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    limit: Schema.optional(Schema.Number),
  }),
  schema: Schema.Array(TimelineEntry),
})

export const ReviewDetailQuery = queryDef({
  key: "reviews.detail",
  query: api.reviews.getReview,
  args: Schema.Struct({ reviewId: Schema.String }),
  schema: Schema.NullOr(ReviewSummary),
})

export const ReviewListQuery = queryDef({
  key: "reviews.list",
  query: api.reviews.listReviewsByOrchestration,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    phaseNumber: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(ReviewSummary),
})

export const ReviewThreadListQuery = queryDef({
  key: "reviewThreads.list",
  query: api.reviewThreads.listThreadsByReview,
  args: Schema.Struct({
    reviewId: Schema.String,
    status: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(ReviewThread),
})

export const ReviewGateListQuery = queryDef({
  key: "reviewGates.list",
  query: api.reviewGates.listGatesByOrchestration,
  args: Schema.Struct({ orchestrationId: Schema.String }),
  schema: Schema.Array(ReviewGate),
})

