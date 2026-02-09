import { Schema } from "effect"

export const TeamMember = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  orchestrationId: Schema.String,
  phaseNumber: Schema.String,
  agentName: Schema.String,
  agentType: Schema.optionalWith(Schema.String, { as: "Option" }),
  model: Schema.optionalWith(Schema.String, { as: "Option" }),
  joinedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  recordedAt: Schema.String,
})

export type TeamMember = typeof TeamMember.Type
