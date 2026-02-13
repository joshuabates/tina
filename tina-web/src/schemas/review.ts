import { Schema } from "effect"
import { optionalString, orchestrationScopedDocumentFields } from "./common"

export const ReviewSummary = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  phaseNumber: optionalString,
  state: Schema.String,
  reviewerAgent: Schema.String,
  startedAt: Schema.String,
  completedAt: optionalString,
})

export type ReviewSummary = typeof ReviewSummary.Type
