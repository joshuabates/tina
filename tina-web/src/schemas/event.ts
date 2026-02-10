import { Schema } from "effect"
import { orchestrationScopedDocumentFields, optionalString } from "./common"

export const OrchestrationEvent = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  phaseNumber: optionalString,
  eventType: Schema.String,
  source: Schema.String,
  summary: Schema.String,
  detail: optionalString,
  recordedAt: Schema.String,
})

export type OrchestrationEvent = typeof OrchestrationEvent.Type
