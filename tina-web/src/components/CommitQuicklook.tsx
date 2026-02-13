import { useId, useRef } from "react"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useCreateSession } from "@/hooks/useCreateSession"
import { useQuicklookKeyboard } from "@/hooks/useQuicklookKeyboard"
import type { Commit } from "@/schemas"
import type { DaemonCommitDetail } from "@/hooks/useDaemonQuery"
import styles from "./QuicklookDialog.module.scss"

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

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(commit.sha)
  }

  const subject = commit.detail?.subject ?? "Commit message unavailable (daemon offline)"
  const author = commit.detail?.author ?? "Unknown"
  const time = commit.detail?.timestamp
    ? new Date(commit.detail.timestamp).toLocaleString()
    : "Unavailable"
  const insertionsValue = commit.detail?.insertions
  const deletionsValue = commit.detail?.deletions
  const insertions = insertionsValue !== undefined ? `+${insertionsValue}` : "--"
  const deletions = deletionsValue !== undefined ? `-${deletionsValue}` : "--"

  const handleReviewCommit = () => {
    const stats =
      insertionsValue !== undefined && deletionsValue !== undefined
        ? `+${insertionsValue} -${deletionsValue}`
        : "Stats unavailable"
    const summary = [
      `Commit: ${commit.sha}`,
      `Message: ${subject}`,
      `Author: ${author}`,
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
        className={styles.modal}
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
          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">SHA</div>
              <div className="flex items-center gap-2">
                <code className="text-primary font-mono">{commit.sha}</code>
                <button
                  onClick={handleCopyToClipboard}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Message</div>
              <div className="font-semibold">{subject}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Author</div>
                <div>{author}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Time</div>
                <div>{time}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Insertions</div>
                <div className="text-green-400">{insertions}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Deletions</div>
                <div className="text-red-400">{deletions}</div>
              </div>
            </div>

            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={handleReviewCommit}
            >
              Review this commit
            </button>

          </div>
        </div>
      </div>
    </div>
  )
}
