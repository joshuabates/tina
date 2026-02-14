import { Schema } from "effect"
import { convexDocumentFields } from "./common"

export const DesignSummary = Schema.Struct({
  ...convexDocumentFields,
  projectId: Schema.String,
  designKey: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  prompt: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})

export type DesignSummary = typeof DesignSummary.Type
