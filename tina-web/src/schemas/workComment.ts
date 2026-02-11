import { Schema } from "effect"
import { convexDocumentFields, optionalString } from "./common"

export const WorkComment = Schema.Struct({
  ...convexDocumentFields,
  projectId: Schema.String,
  targetType: Schema.String,
  targetId: Schema.String,
  authorType: Schema.String,
  authorName: Schema.String,
  body: Schema.String,
  createdAt: Schema.String,
  editedAt: optionalString,
})

export type WorkComment = typeof WorkComment.Type
