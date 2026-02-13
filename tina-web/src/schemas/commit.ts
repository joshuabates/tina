import { Schema } from "effect"
import { orchestrationScopedDocumentFields } from "./common"

export const Commit = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  phaseNumber: Schema.String,
  sha: Schema.String,
  shortSha: Schema.optional(Schema.String),
  subject: Schema.optional(Schema.String),
  recordedAt: Schema.String,
})

export type Commit = typeof Commit.Type

export const CommitDetail = Schema.Struct({
  sha: Schema.String,
  subject: Schema.String,
  author: Schema.String,
  timestamp: Schema.String,
  insertions: Schema.Number,
  deletions: Schema.Number,
})

export type CommitDetail = typeof CommitDetail.Type
