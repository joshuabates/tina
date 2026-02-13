import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { orchestrationCoreTableFields } from "./generated/orchestrationCore";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    repoPath: v.string(),
    createdAt: v.string(),
  }).index("by_repo_path", ["repoPath"]),

  nodes: defineTable({
    name: v.string(),
    os: v.string(),
    status: v.string(),
    lastHeartbeat: v.number(),
    registeredAt: v.number(),
    authTokenHash: v.string(),
  }).index("by_name_auth", ["name", "authTokenHash"]),

  orchestrations: defineTable({
    ...orchestrationCoreTableFields,
    projectId: v.optional(v.id("projects")),
    designId: v.optional(v.id("designs")),
  })
    .index("by_feature", ["featureName"])
    .index("by_node", ["nodeId"])
    .index("by_project", ["projectId"]),

  supervisorStates: defineTable({
    nodeId: v.id("nodes"),
    featureName: v.string(),
    stateJson: v.string(),
    updatedAt: v.number(),
  })
    .index("by_feature", ["featureName"])
    .index("by_node", ["nodeId"])
    .index("by_feature_node", ["featureName", "nodeId"]),

  phases: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    status: v.string(),
    planPath: v.optional(v.string()),
    gitRange: v.optional(v.string()),
    planningMins: v.optional(v.number()),
    executionMins: v.optional(v.number()),
    reviewMins: v.optional(v.number()),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_orchestration_phase", ["orchestrationId", "phaseNumber"]),

  taskEvents: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
    taskId: v.string(),
    subject: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    owner: v.optional(v.string()),
    blockedBy: v.optional(v.string()),
    metadata: v.optional(v.string()),
    recordedAt: v.string(),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_orchestration_task", ["orchestrationId", "taskId"])
    .index("by_orchestration_recorded", ["orchestrationId", "recordedAt"]),

  executionTasks: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    taskNumber: v.number(),
    subject: v.string(),
    description: v.optional(v.string()),
    status: v.string(), // pending, in_progress, completed, skipped
    model: v.optional(v.string()), // opus, sonnet, haiku
    dependsOn: v.optional(v.array(v.number())),
    revision: v.number(),
    insertedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_orchestration_phase", ["orchestrationId", "phaseNumber"])
    .index("by_orchestration_phase_task", [
      "orchestrationId",
      "phaseNumber",
      "taskNumber",
    ]),

  orchestrationEvents: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
    eventType: v.string(),
    source: v.string(),
    summary: v.string(),
    detail: v.optional(v.string()),
    recordedAt: v.string(),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_orchestration_recorded", ["orchestrationId", "recordedAt"]),

  teamMembers: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    agentName: v.string(),
    agentType: v.optional(v.string()),
    model: v.optional(v.string()),
    joinedAt: v.optional(v.string()),
    recordedAt: v.string(),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_orchestration_phase_agent", [
      "orchestrationId",
      "phaseNumber",
      "agentName",
    ]),

  teams: defineTable({
    teamName: v.string(),
    orchestrationId: v.id("orchestrations"),
    leadSessionId: v.string(),
    tmuxSessionName: v.optional(v.string()),
    phaseNumber: v.optional(v.string()),
    parentTeamId: v.optional(v.id("teams")),
    createdAt: v.number(),
  })
    .index("by_team_name", ["teamName"])
    .index("by_orchestration", ["orchestrationId"])
    .index("by_parent", ["parentTeamId"]),

  inboundActions: defineTable({
    nodeId: v.id("nodes"),
    orchestrationId: v.id("orchestrations"),
    type: v.string(),
    payload: v.string(),
    status: v.string(),
    result: v.optional(v.string()),
    createdAt: v.number(),
    claimedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    controlActionId: v.optional(v.id("controlPlaneActions")),
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_node_status", ["nodeId", "status"])
    .index("by_orchestration", ["orchestrationId"]),

  controlPlaneActions: defineTable({
    orchestrationId: v.id("orchestrations"),
    actionType: v.string(),
    payload: v.string(),
    requestedBy: v.string(),
    idempotencyKey: v.string(),
    status: v.string(),
    result: v.optional(v.string()),
    queueActionId: v.optional(v.id("inboundActions")),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_orchestration_created", ["orchestrationId", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_idempotency", ["idempotencyKey"]),

  commits: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    sha: v.string(),
    shortSha: v.string(),
    subject: v.string(),
    author: v.string(),
    timestamp: v.string(),
    insertions: v.number(),
    deletions: v.number(),
    recordedAt: v.string(),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_phase", ["orchestrationId", "phaseNumber"])
    .index("by_sha", ["sha"]),

  plans: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.string(),
    planPath: v.string(),
    content: v.string(),
    lastSynced: v.string(),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_phase", ["orchestrationId", "phaseNumber"])
    .index("by_path", ["planPath"]),

  telemetrySpans: defineTable({
    traceId: v.string(),
    spanId: v.string(),
    parentSpanId: v.optional(v.string()),
    orchestrationId: v.optional(v.id("orchestrations")),
    featureName: v.optional(v.string()),
    phaseNumber: v.optional(v.string()),
    teamName: v.optional(v.string()),
    taskId: v.optional(v.string()),
    source: v.string(),
    operation: v.string(),
    startedAt: v.string(),
    endedAt: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    status: v.string(),
    errorCode: v.optional(v.string()),
    errorDetail: v.optional(v.string()),
    attrs: v.optional(v.string()),
    recordedAt: v.string(),
  })
    .index("by_span_id", ["spanId"])
    .index("by_trace_time", ["traceId", "recordedAt"])
    .index("by_orchestration_time", ["orchestrationId", "recordedAt"])
    .index("by_source_time", ["source", "recordedAt"])
    .index("by_operation_time", ["operation", "recordedAt"]),

  telemetryEvents: defineTable({
    traceId: v.string(),
    spanId: v.string(),
    parentSpanId: v.optional(v.string()),
    orchestrationId: v.optional(v.id("orchestrations")),
    featureName: v.optional(v.string()),
    phaseNumber: v.optional(v.string()),
    teamName: v.optional(v.string()),
    taskId: v.optional(v.string()),
    source: v.string(),
    eventType: v.string(),
    severity: v.string(),
    message: v.string(),
    status: v.optional(v.string()),
    attrs: v.optional(v.string()),
    recordedAt: v.string(),
  })
    .index("by_trace_time", ["traceId", "recordedAt"])
    .index("by_orchestration_time", ["orchestrationId", "recordedAt"])
    .index("by_source_time", ["source", "recordedAt"])
    .index("by_event_type_time", ["eventType", "recordedAt"]),

  telemetryRollups: defineTable({
    windowStart: v.string(),
    windowEnd: v.string(),
    granularityMin: v.number(),
    source: v.string(),
    operation: v.string(),
    orchestrationId: v.optional(v.id("orchestrations")),
    phaseNumber: v.optional(v.string()),
    spanCount: v.number(),
    errorCount: v.number(),
    eventCount: v.number(),
    p95DurationMs: v.optional(v.number()),
    maxDurationMs: v.optional(v.number()),
  })
    .index("by_window_source", ["windowStart", "source"])
    .index("by_window_operation", ["windowStart", "operation"])
    .index("by_window_source_operation", [
      "windowStart",
      "source",
      "operation",
    ]),

  designs: defineTable({
    projectId: v.id("projects"),
    designKey: v.string(),
    title: v.string(),
    markdown: v.string(),
    status: v.string(), // draft | in_review | approved | archived
    createdAt: v.string(),
    updatedAt: v.string(),
    archivedAt: v.optional(v.string()),
    complexityPreset: v.optional(v.string()), // simple | standard | complex
    requiredMarkers: v.optional(v.array(v.string())),
    completedMarkers: v.optional(v.array(v.string())),
    phaseCount: v.optional(v.number()),
    phaseStructureValid: v.optional(v.boolean()),
    validationUpdatedAt: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_key", ["designKey"]),

  tickets: defineTable({
    projectId: v.id("projects"),
    designId: v.optional(v.id("designs")),
    ticketKey: v.string(),
    title: v.string(),
    description: v.string(),
    status: v.string(), // todo | in_progress | in_review | blocked | done | canceled
    priority: v.string(), // low | medium | high | urgent
    estimate: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    closedAt: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_design", ["designId"])
    .index("by_key", ["ticketKey"]),

  workComments: defineTable({
    projectId: v.id("projects"),
    targetType: v.string(), // design | ticket
    targetId: v.string(),
    authorType: v.string(), // human | agent
    authorName: v.string(),
    body: v.string(),
    createdAt: v.string(),
    editedAt: v.optional(v.string()),
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_project_created", ["projectId", "createdAt"]),

  projectCounters: defineTable({
    projectId: v.id("projects"),
    counterType: v.string(), // design | ticket
    nextValue: v.number(),
  })
    .index("by_project_type", ["projectId", "counterType"]),

  featureFlags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  reviews: defineTable({
    orchestrationId: v.id("orchestrations"),
    phaseNumber: v.optional(v.string()),
    state: v.union(
      v.literal("open"),
      v.literal("changes_requested"),
      v.literal("approved"),
      v.literal("superseded"),
    ),
    reviewerAgent: v.string(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_orchestration_phase", ["orchestrationId", "phaseNumber"]),

  reviewThreads: defineTable({
    reviewId: v.id("reviews"),
    orchestrationId: v.id("orchestrations"),
    filePath: v.string(),
    line: v.number(),
    commitSha: v.string(),
    summary: v.string(),
    body: v.string(),
    severity: v.union(v.literal("p0"), v.literal("p1"), v.literal("p2")),
    status: v.union(v.literal("unresolved"), v.literal("resolved")),
    source: v.union(v.literal("human"), v.literal("agent")),
    author: v.string(),
    gateImpact: v.union(
      v.literal("plan"),
      v.literal("review"),
      v.literal("finalize"),
    ),
    createdAt: v.string(),
    resolvedAt: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
  })
    .index("by_review", ["reviewId"])
    .index("by_orchestration", ["orchestrationId"])
    .index("by_review_status", ["reviewId", "status"]),

  reviewChecks: defineTable({
    reviewId: v.id("reviews"),
    orchestrationId: v.id("orchestrations"),
    name: v.string(),
    kind: v.union(v.literal("cli"), v.literal("project")),
    command: v.optional(v.string()),
    status: v.union(
      v.literal("running"),
      v.literal("passed"),
      v.literal("failed"),
    ),
    comment: v.optional(v.string()),
    output: v.optional(v.string()),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  })
    .index("by_review", ["reviewId"])
    .index("by_orchestration", ["orchestrationId"])
    .index("by_review_name", ["reviewId", "name"]),

  reviewGates: defineTable({
    orchestrationId: v.id("orchestrations"),
    gateId: v.union(
      v.literal("plan"),
      v.literal("review"),
      v.literal("finalize"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("blocked"),
      v.literal("approved"),
    ),
    owner: v.string(),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.string()),
    summary: v.string(),
  })
    .index("by_orchestration", ["orchestrationId"])
    .index("by_orchestration_gate", ["orchestrationId", "gateId"]),
});
