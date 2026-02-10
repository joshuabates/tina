import { Schema } from "effect"
import { Phase } from "./phase"
import { TaskEvent } from "./task"
import { TeamMember } from "./team"
import { convexDocumentFields, orchestrationCoreFields } from "./common"

export const OrchestrationDetail = Schema.Struct({
  ...convexDocumentFields,
  ...orchestrationCoreFields,
  phases: Schema.Array(Phase),
  tasks: Schema.Array(TaskEvent),
  orchestratorTasks: Schema.Array(TaskEvent),
  phaseTasks: Schema.Record({ key: Schema.String, value: Schema.Array(TaskEvent) }),
  teamMembers: Schema.Array(TeamMember),
})

export type OrchestrationDetail = typeof OrchestrationDetail.Type
