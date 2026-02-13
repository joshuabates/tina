import { Schema } from "effect"
import { optionalString, orchestrationScopedDocumentFields } from "./common"

export const ReviewThread = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  reviewId: Schema.String,
  filePath: Schema.String,
  line: Schema.Number,
  commitSha: Schema.String,
  summary: Schema.String,
  body: Schema.String,
  severity: Schema.String,
  status: Schema.String,
  source: Schema.String,
  author: Schema.String,
  gateImpact: Schema.String,
  createdAt: Schema.String,
  resolvedAt: optionalString,
  resolvedBy: optionalString,
})

export type ReviewThread = typeof ReviewThread.Type
