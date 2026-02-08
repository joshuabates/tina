import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  nodes: defineTable({
    name: v.string(),
    os: v.string(),
    status: v.string(),
    lastHeartbeat: v.number(),
    registeredAt: v.number(),
    authTokenHash: v.string(),
  }),

  orchestrations: defineTable({
    nodeId: v.id("nodes"),
    featureName: v.string(),
    designDocPath: v.string(),
    branch: v.string(),
    worktreePath: v.optional(v.string()),
    totalPhases: v.number(),
    currentPhase: v.number(),
    status: v.string(),
    startedAt: v.string(),
    completedAt: v.optional(v.string()),
    totalElapsedMins: v.optional(v.number()),
  })
    .index("by_feature", ["featureName"])
    .index("by_node", ["nodeId"]),

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
  })
    .index("by_node_status", ["nodeId", "status"])
    .index("by_orchestration", ["orchestrationId"]),
});
