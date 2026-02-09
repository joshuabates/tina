import { Schema } from "effect"

export const TaskEvent = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  orchestrationId: Schema.String,
  phaseNumber: Schema.optionalWith(Schema.String, { as: "Option" }),
  taskId: Schema.String,
  subject: Schema.String,
  description: Schema.optionalWith(Schema.String, { as: "Option" }),
  status: Schema.String,
  owner: Schema.optionalWith(Schema.String, { as: "Option" }),
  blockedBy: Schema.optionalWith(Schema.String, { as: "Option" }),
  metadata: Schema.optionalWith(Schema.String, { as: "Option" }),
  recordedAt: Schema.String,
})

export type TaskEvent = typeof TaskEvent.Type
