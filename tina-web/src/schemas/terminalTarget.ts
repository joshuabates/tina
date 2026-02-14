import { Schema } from "effect"

const TerminalContext = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
  summary: Schema.String,
})

export const TerminalTarget = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  tmuxSessionName: Schema.String,
  tmuxPaneId: Schema.String,
  type: Schema.Literal("agent", "adhoc"),
  cli: Schema.String,
  context: Schema.optional(TerminalContext),
})

export type TerminalTarget = typeof TerminalTarget.Type
