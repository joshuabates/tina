import { Schema } from "effect"
import { convexDocumentFields, optionalString } from "./common"

export const DesignSummary = Schema.Struct({
  ...convexDocumentFields,
  projectId: Schema.String,
  designKey: Schema.String,
  title: Schema.String,
  markdown: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  archivedAt: optionalString,
})

export type DesignSummary = typeof DesignSummary.Type
