import { Schema } from "effect"
import { convexDocumentFields } from "./common"

export const ReviewGate = Schema.Struct({
  ...convexDocumentFields,
  orchestrationId: Schema.String,
  gateId: Schema.String,
  status: Schema.String,
  owner: Schema.String,
  decidedBy: Schema.optionalWith(Schema.String, { as: "Option" }),
  decidedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  summary: Schema.String,
})

export type ReviewGate = typeof ReviewGate.Type
