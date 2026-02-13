import { Schema } from "effect"
import { orchestrationScopedDocumentFields, optionalString } from "./common"

export const FeedbackEntry = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  targetType: Schema.String,
  targetTaskId: optionalString,
  targetCommitSha: optionalString,
  entryType: Schema.String,
  body: Schema.String,
  authorType: Schema.String,
  authorName: Schema.String,
  status: Schema.String,
  resolvedBy: optionalString,
  resolvedAt: optionalString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})

export type FeedbackEntry = typeof FeedbackEntry.Type

export const BlockingFeedbackSummary = Schema.Struct({
  openAskForChangeCount: Schema.Number,
  totalBlocking: Schema.optional(Schema.Number),
  byTargetType: Schema.optional(Schema.Struct({
    task: Schema.Number,
    commit: Schema.Number,
  })),
  entries: Schema.Array(FeedbackEntry),
})

export type BlockingFeedbackSummary = typeof BlockingFeedbackSummary.Type
