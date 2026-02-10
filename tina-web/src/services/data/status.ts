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

export function normalizeStatus(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

export function statusColor(status: string): string {
  const normalized = status.toLowerCase()
  switch (normalized) {
    case 'executing': return 'text-status-active'
    case 'complete': return 'text-status-complete'
    case 'blocked': return 'text-status-blocked'
    case 'reviewing': return 'text-status-review'
    default: return 'text-muted-foreground'
  }
}
