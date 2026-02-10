import { useMemo } from "react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { isGitEvent, isPhaseReviewEvent } from "@/services/data/events"
import type { OrchestrationEvent } from "@/schemas"
import { matchQueryResult } from "@/lib/query-state"

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
    return matchQueryResult<readonly OrchestrationEvent[], OrchestrationEventsResult>(eventsResult, {
      loading: () => ({
        status: "loading",
        isLoading: true,
        gitEvents: [],
        reviewEvents: [],
      }),
      error: (error) => ({
        status: "error",
        isLoading: false,
        error,
        gitEvents: [],
        reviewEvents: [],
      }),
      success: (events) => ({
        status: "success",
        isLoading: false,
        gitEvents: events.filter(isGitEvent),
        reviewEvents: events.filter(isPhaseReviewEvent),
      }),
    })
  }, [eventsResult])
}
