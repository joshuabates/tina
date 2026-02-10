import { Schema } from "effect"

export const ProjectSummary = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  name: Schema.String,
  repoPath: Schema.String,
  createdAt: Schema.String,
  orchestrationCount: Schema.Number,
  latestFeature: Schema.NullOr(Schema.String),
  latestStatus: Schema.NullOr(Schema.String),
})

export type ProjectSummary = typeof ProjectSummary.Type
