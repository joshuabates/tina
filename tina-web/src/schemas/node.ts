import { Schema } from "effect"

export const NodeSummary = Schema.Struct({
  _id: Schema.String,
  _creationTime: Schema.Number,
  name: Schema.String,
  os: Schema.String,
  status: Schema.String,
  lastHeartbeat: Schema.Number,
  registeredAt: Schema.Number,
  authTokenHash: Schema.String,
})

export type NodeSummary = typeof NodeSummary.Type
