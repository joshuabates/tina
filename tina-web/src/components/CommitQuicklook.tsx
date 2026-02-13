import { useId, useRef } from "react"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useQuicklookKeyboard } from "@/hooks/useQuicklookKeyboard"
import type { Commit } from "@/schemas"
import styles from "./QuicklookDialog.module.scss"

interface CommitQuicklookProps {
  commit: Commit
  onClose: () => void
}

export function CommitQuicklook({ commit, onClose }: CommitQuicklookProps) {
  const titleId = useId()
  const modalRef = useRef<HTMLDivElement>(null)

  useQuicklookKeyboard(onClose)
  useFocusTrap(modalRef)

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(commit.sha)
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
              <div className="font-semibold">{commit.subject}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Author</div>
                <div>{commit.author}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Time</div>
                <div>{new Date(commit.timestamp).toLocaleString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Insertions</div>
                <div className="text-green-400">+{commit.insertions}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Deletions</div>
                <div className="text-red-400">-{commit.deletions}</div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground italic">
              Full diff view coming in future update
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
