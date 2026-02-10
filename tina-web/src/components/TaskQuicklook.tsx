import { useId } from "react"
import { Option } from "effect"
import { StatusBadge } from "@/components/ui/status-badge"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import type { TaskEvent } from "@/schemas"
import { useQuicklookDialog } from "@/hooks/useQuicklookDialog"
import styles from "./QuicklookDialog.module.scss"
import taskStyles from "./TaskQuicklook.module.scss"

export interface TaskQuicklookProps {
  task: TaskEvent
  onClose: () => void
}

export function TaskQuicklook({ task, onClose }: TaskQuicklookProps) {
  const titleId = useId()
  const status = task.status.toLowerCase() as StatusBadgeStatus
  const { modalRef } = useQuicklookDialog(onClose)

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {task.subject}
          </h2>
          <StatusBadge status={status} />
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close quicklook"
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          {/* Description Section */}
          <section className={taskStyles.section}>
            <h3 className={styles.sectionTitle}>Description</h3>
            <div className={styles.value}>
              {Option.match(task.description, {
                onNone: () => "No description",
                onSome: (desc) => desc,
              })}
            </div>
          </section>

          {/* Details Section */}
          <section className={taskStyles.section}>
            <h3 className={styles.sectionTitle}>Details</h3>
            <div className={taskStyles.detailsGrid}>
              <div className={taskStyles.detailItem}>
                <span className={styles.label}>Owner:</span>
                <span className={styles.value}>
                  {Option.match(task.owner, {
                    onNone: () => "—",
                    onSome: (owner) => owner,
                  })}
                </span>
              </div>
              <div className={taskStyles.detailItem}>
                <span className={styles.label}>Phase:</span>
                <span className={styles.value}>
                  {Option.match(task.phaseNumber, {
                    onNone: () => "—",
                    onSome: (phase) => phase,
                  })}
                </span>
              </div>
              <div className={taskStyles.detailItem}>
                <span className={styles.label}>Recorded:</span>
                <span className={styles.value}>
                  {new Date(task.recordedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </section>

          {/* Blocked By Section - only show when present */}
          {Option.isSome(task.blockedBy) && (
            <section className={taskStyles.section}>
              <h3 className={styles.sectionTitle}>Blocked By</h3>
              <div className={styles.value}>
                {Option.getOrNull(task.blockedBy)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
