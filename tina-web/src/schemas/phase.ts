import { Schema } from "effect"
import {
  orchestrationScopedDocumentFields,
  optionalNumber,
  optionalString,
} from "./common"

export const Phase = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  phaseNumber: Schema.String,
  status: Schema.String,
  planPath: optionalString,
  gitRange: optionalString,
  planningMins: optionalNumber,
  executionMins: optionalNumber,
  reviewMins: optionalNumber,
  startedAt: optionalString,
  completedAt: optionalString,
})

export type Phase = typeof Phase.Type
