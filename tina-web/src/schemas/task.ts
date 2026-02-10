import { Schema } from "effect"
import { orchestrationScopedDocumentFields, optionalString } from "./common"

export const TaskEvent = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  phaseNumber: optionalString,
  taskId: Schema.String,
  subject: Schema.String,
  description: optionalString,
  status: Schema.String,
  owner: optionalString,
  blockedBy: optionalString,
  metadata: optionalString,
  recordedAt: Schema.String,
})

export type TaskEvent = typeof TaskEvent.Type
