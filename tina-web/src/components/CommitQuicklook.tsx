import { useId, useRef } from "react"
import { Option } from "effect"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useCreateSession } from "@/hooks/useCreateSession"
import { useQuicklookKeyboard } from "@/hooks/useQuicklookKeyboard"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import {
  OrchestrationDetailQuery,
  ReviewListQuery,
  ReviewThreadByOrchestrationListQuery,
} from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import type { Commit } from "@/schemas"
import { useDiffFiles, type DaemonCommitDetail } from "@/hooks/useDaemonQuery"
import { ReviewFeedbackComposer, ReviewThreadCard } from "@/components/ReviewFeedback"
import { CommitDiffPreview } from "@/components/CommitDiffPreview"
import styles from "./QuicklookDialog.module.scss"
import commitStyles from "./CommitQuicklook.module.scss"

export interface HydratedCommit extends Commit {
  detail?: DaemonCommitDetail
}

interface CommitQuicklookProps {
  commit: HydratedCommit
  onClose: () => void
}

export function CommitQuicklook({ commit, onClose }: CommitQuicklookProps) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  useQuicklookKeyboard(onClose)
  useFocusTrap(modalRef)

  const { createAndConnect } = useCreateSession()

  const reviewsResult = useTypedQuery(ReviewListQuery, {
    orchestrationId: commit.orchestrationId,
    phaseNumber: commit.phaseNumber,
  })
  const threadsResult = useTypedQuery(ReviewThreadByOrchestrationListQuery, {
    orchestrationId: commit.orchestrationId,
  })
  const orchestrationResult = useTypedQuery(OrchestrationDetailQuery, {
    orchestrationId: commit.orchestrationId,
  })

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(commit.sha)
  }

  const subject = commit.detail?.subject ?? commit.subject ?? "Commit message unavailable (daemon offline)"
  const time = commit.detail?.timestamp
    ? new Date(commit.detail.timestamp).toLocaleString()
    : "Unavailable"
  const insertionsValue = commit.detail?.insertions
  const deletionsValue = commit.detail?.deletions

  const latestReviewId =
    reviewsResult.status === "success"
      ? (reviewsResult.data.find((review) => review.state === "open") ??
          reviewsResult.data[0])?._id ?? null
      : null

  const commitThreads =
    threadsResult.status === "success"
      ? threadsResult.data.filter((thread) => thread.commitSha === commit.sha)
      : []

  const reviewContextMessage =
    reviewsResult.status === "loading"
      ? "Loading review context..."
      : reviewsResult.status === "error"
        ? "Review context unavailable for this commit"
        : "No review available for this phase yet"

  const worktreePath =
    orchestrationResult.status === "success" && orchestrationResult.data
      ? Option.getOrElse(orchestrationResult.data.worktreePath, () => "")
      : ""
  const diffBase = `${commit.sha}^`
  const diffFilesResult = useDiffFiles(worktreePath, diffBase)

  const diffTotals = diffFilesResult.data
    ? diffFilesResult.data.reduce(
        (totals, file) => ({
          insertions: totals.insertions + file.insertions,
          deletions: totals.deletions + file.deletions,
        }),
        { insertions: 0, deletions: 0 },
      )
    : null

  const finalInsertionsValue =
    diffTotals && (diffTotals.insertions > 0 || diffTotals.deletions > 0)
      ? diffTotals.insertions
      : insertionsValue
  const finalDeletionsValue =
    diffTotals && (diffTotals.insertions > 0 || diffTotals.deletions > 0)
      ? diffTotals.deletions
      : deletionsValue
  const insertions = finalInsertionsValue !== undefined ? `+${finalInsertionsValue}` : "--"
  const deletions = finalDeletionsValue !== undefined ? `-${finalDeletionsValue}` : "--"

  const handleReviewCommit = () => {
    const stats =
      finalInsertionsValue !== undefined && finalDeletionsValue !== undefined
        ? `+${finalInsertionsValue} -${finalDeletionsValue}`
        : "Stats unavailable"
    const summary = [
      `Commit: ${commit.sha}`,
      `Message: ${subject}`,
      stats,
    ].join("\n")

    createAndConnect({
      label: `Review: ${subject}`,
      contextType: "commit",
      contextId: commit._id,
      contextSummary: summary,
    })
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${styles.modal} ${commitStyles.modal}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Commit Details
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close quicklook"
          >
            x
          </button>
        </div>
        <div className={styles.content}>
          <div className={commitStyles.contentWrap}>
            <div>
              <div className={commitStyles.metaRow}>
                <code className={commitStyles.shaText}>{commit.sha}</code>
                <button
                  type="button"
                  onClick={handleCopyToClipboard}
                  className={commitStyles.copyButton}
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <div className={commitStyles.messageLabel}>Message</div>
              <div className={commitStyles.messageText}>{subject}</div>
            </div>

            <div className={commitStyles.summaryRow}>
              <span className={commitStyles.timeText}>{time}</span>
              <span className={commitStyles.insertions}>{insertions}</span>
              <span className={commitStyles.deletions}>{deletions}</span>
            </div>

            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={handleReviewCommit}
            >
              Review this commit
            </button>

            <div className="border-t border-border/70 pt-4">
              <div className="text-sm font-semibold mb-3">Diff</div>
              {orchestrationResult.status === "loading" ? (
                <div className="text-muted-foreground text-sm">Loading diff context...</div>
              ) : worktreePath.length === 0 ? (
                <div className="text-muted-foreground text-sm">
                  Worktree path unavailable for diff preview
                </div>
              ) : (
                <CommitDiffPreview
                  worktreePath={worktreePath}
                  baseBranch={diffBase}
                />
              )}
            </div>

            <div className="border-t border-border/70 pt-4">
              <div className="text-sm font-semibold mb-3">Feedback</div>

              <ReviewFeedbackComposer
                reviewId={latestReviewId}
                orchestrationId={commit.orchestrationId}
                commitSha={commit.sha}
                emptyMessage={reviewContextMessage}
                summaryPlaceholder="Feedback summary"
                bodyPlaceholder="What should change?"
                submitLabel="Add feedback"
                successMessage="Feedback added"
              />

              {matchQueryResult(threadsResult, {
                loading: () => (
                  <div className="text-muted-foreground text-sm">Loading feedback...</div>
                ),
                error: () => (
                  <div className="text-red-500 text-sm">Failed to load feedback</div>
                ),
                success: () => {
                  if (commitThreads.length === 0) {
                    return (
                      <div className="text-muted-foreground text-sm">
                        No feedback yet for this commit
                      </div>
                    )
                  }

                  return (
                    <div className="space-y-3">
                      {commitThreads.map((thread) => (
                        <ReviewThreadCard key={thread._id} thread={thread} />
                      ))}
                    </div>
                  )
                },
              })}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
