import { Schema } from "effect"
import { convexDocumentFields, optionalString, optionalNumber, optionalBoolean, optionalStringArray } from "./common"

export const SpecSummary = Schema.Struct({
  ...convexDocumentFields,
  projectId: Schema.String,
  specKey: Schema.String,
  title: Schema.String,
  markdown: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  archivedAt: optionalString,
  complexityPreset: optionalString,
  requiredMarkers: optionalStringArray,
  completedMarkers: optionalStringArray,
  phaseCount: optionalNumber,
  phaseStructureValid: optionalBoolean,
  validationUpdatedAt: optionalString,
})

export type SpecSummary = typeof SpecSummary.Type
