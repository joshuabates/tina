import { Schema } from "effect"
import { optionalString, optionalNumber, orchestrationScopedDocumentFields } from "./common"

export const ReviewCheck = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  reviewId: Schema.String,
  name: Schema.String,
  kind: Schema.String,
  command: optionalString,
  status: Schema.String,
  comment: optionalString,
  output: optionalString,
  startedAt: Schema.String,
  completedAt: optionalString,
  durationMs: optionalNumber,
})

export type ReviewCheck = typeof ReviewCheck.Type
