import type { OrchestrationEvent } from "@/schemas"

export function isGitEvent(event: OrchestrationEvent): boolean {
  return event.eventType.startsWith("git_")
}

export function isPhaseReviewEvent(event: OrchestrationEvent): boolean {
  return event.eventType.startsWith("phase_review")
}
