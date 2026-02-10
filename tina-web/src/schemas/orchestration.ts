import { Schema } from "effect"
import { convexDocumentFields, optionalString, orchestrationCoreFields } from "./common"

export const OrchestrationSummary = Schema.Struct({
  ...convexDocumentFields,
  ...orchestrationCoreFields,
  projectId: optionalString,
})

export type OrchestrationSummary = typeof OrchestrationSummary.Type
