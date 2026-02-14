import { Schema } from "effect"
import { convexDocumentFields, optionalStringArray } from "./common"

export const DesignVariation = Schema.Struct({
  ...convexDocumentFields,
  designId: Schema.String,
  slug: Schema.String,
  title: Schema.String,
  status: Schema.String,
  screenshotStorageIds: optionalStringArray,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})

export type DesignVariation = typeof DesignVariation.Type
