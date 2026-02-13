import { Schema } from "effect"
import { optionalString, orchestrationScopedDocumentFields } from "./common"

export const ReviewGate = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  gateId: Schema.String,
  status: Schema.String,
  owner: Schema.String,
  decidedBy: optionalString,
  decidedAt: optionalString,
  summary: Schema.String,
})

export type ReviewGate = typeof ReviewGate.Type
