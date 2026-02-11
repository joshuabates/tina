import { Schema } from "effect"
import { convexDocumentFields, optionalString } from "./common"

export const TicketSummary = Schema.Struct({
  ...convexDocumentFields,
  projectId: Schema.String,
  designId: optionalString,
  ticketKey: Schema.String,
  title: Schema.String,
  description: Schema.String,
  status: Schema.String,
  priority: Schema.String,
  assignee: optionalString,
  estimate: optionalString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  closedAt: optionalString,
})

export type TicketSummary = typeof TicketSummary.Type
