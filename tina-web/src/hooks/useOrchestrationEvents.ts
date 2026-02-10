import { useMemo } from "react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { isGitEvent, isPhaseReviewEvent } from "@/services/data/events"
import type { OrchestrationEvent } from "@/schemas"

interface OrchestrationEventsSuccess {
  status: "success"
  isLoading: false
  gitEvents: OrchestrationEvent[]
  reviewEvents: OrchestrationEvent[]
}

interface OrchestrationEventsLoading {
  status: "loading"
  isLoading: true
  gitEvents: []
  reviewEvents: []
}

interface OrchestrationEventsError {
  status: "error"
  isLoading: false
  error: unknown
  gitEvents: []
  reviewEvents: []
}

export type OrchestrationEventsResult =
  | OrchestrationEventsSuccess
  | OrchestrationEventsLoading
  | OrchestrationEventsError

export function useOrchestrationEvents(
  orchestrationId: string,
): OrchestrationEventsResult {
  const eventsResult = useTypedQuery(EventListQuery, { orchestrationId })

  return useMemo(() => {
    if (eventsResult.status === "loading") {
      return {
        status: "loading",
        isLoading: true,
        gitEvents: [],
        reviewEvents: [],
      }
    }

    if (eventsResult.status === "error") {
      return {
        status: "error",
        isLoading: false,
        error: eventsResult.error,
        gitEvents: [],
        reviewEvents: [],
      }
    }

    const gitEvents = eventsResult.data.filter(isGitEvent)
    const reviewEvents = eventsResult.data.filter(isPhaseReviewEvent)

    return {
      status: "success",
      isLoading: false,
      gitEvents,
      reviewEvents,
    }
  }, [eventsResult])
}
