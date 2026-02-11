import { useMemo } from "react"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { CommitListQuery, EventListQuery } from "@/services/data/queryDefs"
import { isPhaseReviewEvent } from "@/services/data/events"
import type { Commit, OrchestrationEvent } from "@/schemas"
import { firstQueryError, isAnyQueryLoading } from "@/lib/query-state"

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

function commitToGitEvent(commit: Commit): OrchestrationEvent {
  return {
    _id: commit._id,
    _creationTime: commit._creationTime,
    orchestrationId: commit.orchestrationId,
    phaseNumber: Option.some(commit.phaseNumber),
    eventType: "git_commit",
    source: "tina-daemon",
    summary: commit.subject,
    detail: Option.some(commit.shortSha),
    recordedAt: commit.recordedAt,
  }
}

export function useOrchestrationEvents(
  orchestrationId: string,
): OrchestrationEventsResult {
  const eventsResult = useTypedQuery(EventListQuery, { orchestrationId })
  const commitsResult = useTypedQuery(CommitListQuery, { orchestrationId })

  return useMemo(() => {
    if (isAnyQueryLoading(eventsResult, commitsResult)) {
      return {
        status: "loading",
        isLoading: true,
        gitEvents: [],
        reviewEvents: [],
      }
    }

    const queryError = firstQueryError(eventsResult, commitsResult)
    if (queryError) {
      return {
        status: "error",
        isLoading: false,
        error: queryError,
        gitEvents: [],
        reviewEvents: [],
      }
    }

    if (eventsResult.status !== "success" || commitsResult.status !== "success") {
      return {
        status: "loading",
        isLoading: true,
        gitEvents: [],
        reviewEvents: [],
      }
    }

    return {
      status: "success",
      isLoading: false,
      gitEvents: commitsResult.data.map(commitToGitEvent),
      reviewEvents: eventsResult.data.filter(isPhaseReviewEvent),
    }
  }, [eventsResult, commitsResult])
}
