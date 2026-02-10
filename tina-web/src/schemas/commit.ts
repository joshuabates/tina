import { Schema } from "effect"
import { orchestrationScopedDocumentFields } from "./common"

export const Commit = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  phaseNumber: Schema.String,
  sha: Schema.String,
  shortSha: Schema.String,
  subject: Schema.String,
  author: Schema.String,
  timestamp: Schema.String,
  insertions: Schema.Number,
  deletions: Schema.Number,
  recordedAt: Schema.String,
})

export type Commit = typeof Commit.Type
