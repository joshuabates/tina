import { Schema } from "effect"

export const Phase = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  orchestrationId: Schema.String,
  phaseNumber: Schema.String,
  status: Schema.String,
  planPath: Schema.optionalWith(Schema.String, { as: "Option" }),
  gitRange: Schema.optionalWith(Schema.String, { as: "Option" }),
  planningMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  executionMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  reviewMins: Schema.optionalWith(Schema.Number, { as: "Option" }),
  startedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  completedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
})

export type Phase = typeof Phase.Type
