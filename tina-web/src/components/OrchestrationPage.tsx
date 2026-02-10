import { DataErrorBoundary } from "./DataErrorBoundary"
import { PhaseTimelinePanel } from "./PhaseTimelinePanel"
import { TaskListPanel } from "./TaskListPanel"
import { RightPanel } from "./RightPanel"
import { useSelection } from "@/hooks/useSelection"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { OrchestrationDetailQuery } from "@/services/data/queryDefs"
import { toOrchestrationId } from "@/services/data/id"
import { NotFoundError } from "@/services/errors"
import styles from "./OrchestrationPage.module.scss"

export function OrchestrationPage() {
  return (
    <DataErrorBoundary panelName="orchestration">
      <OrchestrationPageContent />
    </DataErrorBoundary>
  )
}

function OrchestrationPageContent() {
  const { orchestrationId } = useSelection()

  // No orchestration selected - show empty state
  if (!orchestrationId) {
    return (
      <div className={styles.orchestrationPage}>
        <div className={styles.empty}>
          Select an orchestration from the sidebar
        </div>
      </div>
    )
  }

  // Convert to Convex ID - throws NotFoundError if invalid
  const convexId = toOrchestrationId(orchestrationId)

  // Query for orchestration detail
  const result = useTypedQuery(OrchestrationDetailQuery, {
    orchestrationId: convexId,
  })

  // Loading state
  if (result.status === "loading") {
    return (
      <div className={styles.orchestrationPage}>
        <div className={styles.empty}>Loading...</div>
      </div>
    )
  }

  // Error state - throw to error boundary
  if (result.status === "error") {
    throw result.error
  }

  // Not found state - orchestration was deleted or doesn't exist
  if (result.data === null) {
    throw new NotFoundError({
      resource: "orchestration",
      id: orchestrationId,
    })
  }

  const orchestration = result.data

  return (
    <div className={styles.orchestrationPage}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{orchestration.featureName}</div>
          <div className={styles.subtitle}>{orchestration.branch}</div>
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.centerPanel}>
          <div className={styles.timelineColumn}>
            <PhaseTimelinePanel detail={orchestration} />
          </div>
          <div className={styles.taskColumn}>
            <TaskListPanel detail={orchestration} />
          </div>
        </div>
        <div className={styles.rightColumn}>
          <RightPanel detail={orchestration} />
        </div>
      </div>
    </div>
  )
}
