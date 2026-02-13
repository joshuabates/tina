import { Schema } from "effect"
import { convexDocumentFields } from "./common"

export const ReviewThread = Schema.Struct({
  ...convexDocumentFields,
  reviewId: Schema.String,
  orchestrationId: Schema.String,
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
  resolvedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  resolvedBy: Schema.optionalWith(Schema.String, { as: "Option" }),
})

export type ReviewThread = typeof ReviewThread.Type
