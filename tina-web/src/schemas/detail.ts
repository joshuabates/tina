import { Schema } from "effect"
import { Phase } from "./phase"
import { TaskEvent } from "./task"
import { TeamMember } from "./team"

export const OrchestrationDetail = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  nodeId: Schema.String,
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
  phases: Schema.Array(Phase),
  tasks: Schema.Array(TaskEvent),
  orchestratorTasks: Schema.Array(TaskEvent),
  phaseTasks: Schema.Record({ key: Schema.String, value: Schema.Array(TaskEvent) }),
  teamMembers: Schema.Array(TeamMember),
})

export type OrchestrationDetail = typeof OrchestrationDetail.Type
