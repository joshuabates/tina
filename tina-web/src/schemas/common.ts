import { Schema } from "effect"

// Convex document base fields
export const ConvexId = Schema.String.pipe(Schema.brand("ConvexId"))
export type ConvexId = typeof ConvexId.Type

export const ConvexDocument = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
})
