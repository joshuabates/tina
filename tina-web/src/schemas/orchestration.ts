import { Schema } from "effect"
import { convexDocumentFields, optionalString, orchestrationQueryFields } from "./common"

export const OrchestrationSummary = Schema.Struct({
  ...convexDocumentFields,
  ...orchestrationQueryFields,
  projectId: optionalString,
})

export type OrchestrationSummary = typeof OrchestrationSummary.Type
