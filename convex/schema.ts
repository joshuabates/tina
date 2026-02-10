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
  })
    .index("by_node_status", ["nodeId", "status"])
    .index("by_orchestration", ["orchestrationId"]),

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
});
