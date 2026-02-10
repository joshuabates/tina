import { Option } from "effect"
import type { TaskEvent } from "@/schemas"
import { QuicklookDialog } from "@/components/QuicklookDialog"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import styles from "./QuicklookDialog.module.scss"
import taskStyles from "./TaskQuicklook.module.scss"

export interface TaskQuicklookProps {
  task: TaskEvent
  onClose: () => void
}

export function TaskQuicklook({ task, onClose }: TaskQuicklookProps) {
  const status = toStatusBadgeStatus(task.status)

  return (
    <QuicklookDialog title={task.subject} status={status} onClose={onClose}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Description</h3>
        <div className={styles.value}>
          {Option.match(task.description, {
            onNone: () => "No description",
            onSome: (desc) => desc,
          })}
        </div>
      </section>

      <section className={styles.section}>
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

      {Option.isSome(task.blockedBy) && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Blocked By</h3>
          <div className={styles.value}>{Option.getOrNull(task.blockedBy)}</div>
        </section>
      )}
    </QuicklookDialog>
  )
}
