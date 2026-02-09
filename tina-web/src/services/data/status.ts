export const OrchestrationStatus = {
  Planning: "planning",
  Executing: "executing",
  Reviewing: "reviewing",
  Complete: "complete",
  Blocked: "blocked",
} as const

export type OrchestrationStatus = (typeof OrchestrationStatus)[keyof typeof OrchestrationStatus]

export const PhaseStatus = {
  Pending: "pending",
  Planning: "planning",
  Executing: "executing",
  Reviewing: "reviewing",
  Complete: "complete",
  Failed: "failed",
} as const

export type PhaseStatus = (typeof PhaseStatus)[keyof typeof PhaseStatus]

export const TaskStatus = {
  Pending: "pending",
  InProgress: "in_progress",
  Completed: "completed",
  Blocked: "blocked",
} as const

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]
