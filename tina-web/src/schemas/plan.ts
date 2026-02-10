import { Schema } from "effect"
import { orchestrationScopedDocumentFields } from "./common"

export const Plan = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  phaseNumber: Schema.String,
  planPath: Schema.String,
  content: Schema.String,
  lastSynced: Schema.String,
})

export type Plan = typeof Plan.Type
