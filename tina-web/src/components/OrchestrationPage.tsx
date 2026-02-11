import { useEffect, useState } from "react"
import { DataErrorBoundary } from "./DataErrorBoundary"
import { PhaseTimelinePanel } from "./PhaseTimelinePanel"
import { TaskListPanel } from "./TaskListPanel"
import { RightPanel } from "./RightPanel"
import { TelemetryTimeline } from "./TelemetryTimeline"
import { useSelection } from "@/hooks/useSelection"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { OrchestrationDetailQuery } from "@/services/data/queryDefs"
import { NotFoundError } from "@/services/errors"
import { matchQueryResult } from "@/lib/query-state"
import styles from "./OrchestrationPage.module.scss"

export function OrchestrationPage() {
  const { orchestrationId } = useSelection()

  return (
    <DataErrorBoundary key={orchestrationId ?? "none"} panelName="orchestration">
      <OrchestrationPageContent orchestrationId={orchestrationId} />
    </DataErrorBoundary>
  )
}

interface OrchestrationPageContentProps {
  orchestrationId: string | null
}

function OrchestrationPageContent({ orchestrationId }: OrchestrationPageContentProps) {
  const [showTelemetry, setShowTelemetry] = useState(false)
  const { phaseId, selectPhase } = useSelection()

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

  // Query for orchestration detail
  const result = useTypedQuery(OrchestrationDetailQuery, {
    orchestrationId,
  })
  const loadedDetail = result.status === "success" ? result.data : null

  useEffect(() => {
    if (phaseId) return
    if (!loadedDetail) return

    const preferredPhaseId = loadedDetail.phases.find(
      (phase) => phase.phaseNumber === String(loadedDetail.currentPhase),
    )?._id
    const fallbackPhaseId = loadedDetail.phases[0]?._id
    const phaseToSelect = preferredPhaseId ?? fallbackPhaseId

    if (phaseToSelect) {
      selectPhase(phaseToSelect)
    }
  }, [loadedDetail, phaseId, selectPhase])

  return matchQueryResult(result, {
    // Loading state - show skeleton matching three-column layout
    loading: () => (
      <div className={styles.orchestrationPage} aria-busy="true">
        <div className={styles.header}>
          <div className={styles.skeletonText} style={{ width: "150px", height: "14px" }} />
        </div>
        <div className={styles.content}>
          <div className={styles.centerPanel}>
            <div className={styles.timelineColumn}>
              <div className={styles.loading}>
                <div className={styles.skeletonBar} />
                <div className={styles.skeletonBar} />
                <div className={styles.skeletonBar} />
              </div>
            </div>
            <div className={styles.taskColumn}>
              <div className={styles.loading}>
                <div className={styles.skeletonBar} style={{ width: "80%" }} />
                <div className={styles.skeletonBar} style={{ width: "60%" }} />
                <div className={styles.skeletonBar} style={{ width: "70%" }} />
              </div>
            </div>
          </div>
          <div className={styles.rightColumn}>
            <div className={styles.loading}>
              <div className={styles.skeletonBar} style={{ width: "90%" }} />
              <div className={styles.skeletonBar} style={{ width: "85%" }} />
            </div>
          </div>
        </div>
      </div>
    ),
    // Error state - throw to error boundary
    error: (error) => {
      throw error
    },
    success: (orchestration) => {
      // Not found state - orchestration was deleted or doesn't exist
      if (orchestration === null) {
        throw new NotFoundError({
          resource: "orchestration",
          id: orchestrationId,
        })
      }

      return (
        <div className={styles.orchestrationPage}>
          <div className={styles.header}>
            <div>
              <div className={styles.title}>{orchestration.featureName}</div>
              <div className={styles.subtitle}>{orchestration.branch}</div>
            </div>
          </div>
          {/* Accessibility: Live region for status changes */}
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: "absolute",
              width: "1px",
              height: "1px",
              padding: "0",
              margin: "-1px",
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: "0",
            }}
          >
            Orchestration status: {orchestration.status}, Phase {orchestration.currentPhase} of {orchestration.totalPhases}
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
          <div className={styles.telemetryPanel}>
            <button
              className={styles.telemetryToggle}
              onClick={() => setShowTelemetry(!showTelemetry)}
              aria-expanded={showTelemetry}
            >
              <span>Telemetry Timeline</span>
              <span className={styles.toggleIcon}>{showTelemetry ? "▼" : "▶"}</span>
            </button>
            {showTelemetry && (
              <div className={styles.telemetryContent}>
                <TelemetryTimeline orchestrationId={orchestration._id} />
              </div>
            )}
          </div>
        </div>
      )
    },
  })
}
