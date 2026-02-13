import { useMemo } from "react"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useCommitDetails } from "@/hooks/useDaemonQuery"
import {
  CommitListQuery,
  EventListQuery,
  OrchestrationDetailQuery,
} from "@/services/data/queryDefs"
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
  const shortSha = commit.shortSha ?? commit.sha.slice(0, 7)
  const fallbackSummary = commit.subject ?? `Commit ${shortSha}`
  return {
    _id: commit._id,
    _creationTime: commit._creationTime,
    orchestrationId: commit.orchestrationId,
    phaseNumber: Option.some(commit.phaseNumber),
    eventType: "git_commit",
    source: "tina-daemon",
    summary: fallbackSummary,
    detail: Option.some(shortSha),
    recordedAt: commit.recordedAt,
  }
}

function commitToGitEventWithDetail(
  commit: Commit,
  detailMap: Map<string, { subject: string }>,
): OrchestrationEvent {
  const event = commitToGitEvent(commit)
  const detail = detailMap.get(commit.sha)
  return {
    ...event,
    summary: detail?.subject ?? event.summary,
  }
}

export function useOrchestrationEvents(
  orchestrationId: string,
): OrchestrationEventsResult {
  const eventsResult = useTypedQuery(EventListQuery, { orchestrationId })
  const commitsResult = useTypedQuery(CommitListQuery, { orchestrationId })
  const orchestrationResult = useTypedQuery(OrchestrationDetailQuery, { orchestrationId })

  const worktreePath =
    orchestrationResult.status === "success" && orchestrationResult.data
      ? Option.getOrElse(orchestrationResult.data.worktreePath, () => "")
      : ""

  const commitShas =
    commitsResult.status === "success" ? commitsResult.data.map((commit) => commit.sha) : []
  const commitDetailsResult = useCommitDetails(worktreePath, commitShas)

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

    const detailMap = new Map(
      (commitDetailsResult.data?.commits ?? []).map((detail) => [detail.sha, detail] as const),
    )

    return {
      status: "success",
      isLoading: false,
      gitEvents: commitsResult.data.map((commit) =>
        commitToGitEventWithDetail(commit, detailMap),
      ),
      reviewEvents: eventsResult.data.filter(isPhaseReviewEvent),
    }
  }, [eventsResult, commitsResult, commitDetailsResult.data])
}
