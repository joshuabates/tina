import { Schema } from "effect"

export const TimelineEntry = Schema.Struct({
  id: Schema.String,
  timestamp: Schema.Number,
  source: Schema.String,
  category: Schema.String,
  summary: Schema.String,
  detail: Schema.NullOr(Schema.String),
  status: Schema.NullOr(Schema.String),
  actionType: Schema.NullOr(Schema.String),
  reasonCode: Schema.NullOr(Schema.String),
})

export type TimelineEntry = typeof TimelineEntry.Type
