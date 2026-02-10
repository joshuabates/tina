import { Schema } from "effect"
import { orchestrationCoreFields } from "./generated/orchestrationCore"

// Convex document base fields
export const ConvexId = Schema.String.pipe(Schema.brand("ConvexId"))
export type ConvexId = typeof ConvexId.Type

export const optionalString = Schema.optionalWith(Schema.String, { as: "Option" })
export const optionalNumber = Schema.optionalWith(Schema.Number, { as: "Option" })

export const convexDocumentFields = {
  _id: Schema.String,
  _creationTime: Schema.Number,
} as const

export const orchestrationScopedDocumentFields = {
  ...convexDocumentFields,
  orchestrationId: Schema.String,
} as const

export const ConvexDocument = Schema.Struct(convexDocumentFields)
