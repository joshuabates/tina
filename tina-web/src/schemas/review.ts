import { Schema } from "effect"
import { convexDocumentFields } from "./common"

export const ReviewSummary = Schema.Struct({
  ...convexDocumentFields,
  orchestrationId: Schema.String,
  phaseNumber: Schema.optionalWith(Schema.String, { as: "Option" }),
  state: Schema.String,
  reviewerAgent: Schema.String,
  startedAt: Schema.String,
  completedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
})

export type ReviewSummary = typeof ReviewSummary.Type
