import { Schema } from "effect"
import { orchestrationScopedDocumentFields, optionalString } from "./common"

export const TeamMember = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  phaseNumber: Schema.String,
  agentName: Schema.String,
  agentType: optionalString,
  model: optionalString,
  joinedAt: optionalString,
  tmuxPaneId: optionalString,
  recordedAt: Schema.String,
})

export type TeamMember = typeof TeamMember.Type
