import { Schema } from "effect"

export const OrchestrationEvent = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  orchestrationId: Schema.String,
  phaseNumber: Schema.optionalWith(Schema.String, { as: "Option" }),
  eventType: Schema.String,
  source: Schema.String,
  summary: Schema.String,
  detail: Schema.optionalWith(Schema.String, { as: "Option" }),
  recordedAt: Schema.String,
})

export type OrchestrationEvent = typeof OrchestrationEvent.Type
