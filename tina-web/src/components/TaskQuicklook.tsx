import type { TaskEvent } from "@/schemas"
import { optionNullableText, optionText } from "@/lib/option-display"
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
  const blockedBy = optionNullableText(task.blockedBy, (value) => value)

  return (
    <QuicklookDialog title={task.subject} status={status} onClose={onClose}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Description</h3>
        <div className={styles.value}>
          {optionText(task.description, (description) => description, "No description")}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Details</h3>
        <div className={taskStyles.detailsGrid}>
          <div className={taskStyles.detailItem}>
            <span className={styles.label}>Owner:</span>
            <span className={styles.value}>
              {optionText(task.owner, (owner) => owner)}
            </span>
          </div>
          <div className={taskStyles.detailItem}>
            <span className={styles.label}>Phase:</span>
            <span className={styles.value}>
              {optionText(task.phaseNumber, (phase) => phase)}
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

      {blockedBy && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Blocked By</h3>
          <div className={styles.value}>{blockedBy}</div>
        </section>
      )}
    </QuicklookDialog>
  )
}
