import { Schema } from "effect"

export const OrchestrationSummary = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  nodeId: Schema.String,
  projectId: Schema.optionalWith(Schema.String, { as: "Option" }),
  featureName: Schema.String,
  designDocPath: Schema.String,
  branch: Schema.String,
  worktreePath: Schema.optionalWith(Schema.String, { as: "Option" }),
  totalPhases: Schema.Number,
  currentPhase: Schema.Number,
  status: Schema.String,
  startedAt: Schema.String,
  completedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  totalElapsedMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  nodeName: Schema.String,
})

export type OrchestrationSummary = typeof OrchestrationSummary.Type
