import { useMemo, useState } from "react"
import { Option } from "effect"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import {
  AlertTriangle,
  Check,
  CircleDot,
  Clock3,
  Play,
  Search,
} from "lucide-react"
import { DataErrorBoundary } from "./DataErrorBoundary"
import { SidebarItem } from "./ui/sidebar-item"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useSelection } from "@/hooks/useSelection"
import { useIndexedAction } from "@/hooks/useIndexedAction"
import { useRovingSection } from "@/hooks/useRovingSection"
import { OrchestrationDetailQuery, OrchestrationListQuery } from "@/services/data/queryDefs"
import {
  statusIconBgClass,
  statusTextClass,
  toStatusBadgeStatus,
  type StatusBadgeStatus,
} from "@/components/ui/status-styles"
import { firstQueryError, isAnyQueryLoading } from "@/lib/query-state"
import { cn } from "@/lib/utils"
import type { OrchestrationSummary } from "@/schemas"
import styles from "./Sidebar.module.scss"

interface SidebarProps {
  projectId: string
}

interface SelectedOrchestrationPhasesProps {
  orchestrationId: string
  phaseId: string | null
  onSelectPhase: (phaseId: string) => void
}

function phaseLabel(phaseNumber: string): string {
  return `Phase ${phaseNumber}`
}

function orchestrationStatusIcon(status: StatusBadgeStatus): React.ReactNode {
  const iconClassName = cn("h-3.5 w-3.5", statusTextClass(status))

  switch (status) {
    case "complete":
    case "done":
    case "approved":
    case "passed":
      return <Check className={iconClassName} />
    case "blocked":
    case "failed":
    case "canceled":
    case "changes_requested":
      return <AlertTriangle className={iconClassName} />
    case "reviewing":
    case "in_review":
    case "open":
      return <Search className={iconClassName} />
    case "planning":
    case "pending":
    case "todo":
    case "draft":
    case "archived":
    case "superseded":
      return <Clock3 className={iconClassName} />
    case "executing":
    case "active":
    case "in_progress":
    case "launching":
    case "running":
      return <Play className={iconClassName} />
    default:
      return <CircleDot className={iconClassName} />
  }
}

function SelectedOrchestrationPhases({
  orchestrationId,
  phaseId,
  onSelectPhase,
}: SelectedOrchestrationPhasesProps) {
  const detailResult = useTypedQuery(OrchestrationDetailQuery, { orchestrationId })

  if (detailResult.status === "loading") {
    return <div className={styles.phaseLoading}>Loading phases…</div>
  }

  const queryError = firstQueryError(detailResult)
  if (queryError) {
    throw queryError
  }

  if (detailResult.status !== "success" || detailResult.data === null) {
    return null
  }

  if (detailResult.data.phases.length === 0) {
    return null
  }

  return (
    <div className={styles.phaseList} role="list" aria-label="Selected orchestration phases">
      {detailResult.data.phases.map((phase) => {
        const isSelected = phase._id === phaseId
        const dotClass = statusIconBgClass(toStatusBadgeStatus(phase.status)).replace("phase-glow", "")

        return (
          <button
            key={phase._id}
            type="button"
            className={cn(styles.phaseItem, isSelected && styles.phaseItemSelected)}
            onClick={() => onSelectPhase(phase._id)}
            data-phase-id={phase._id}
          >
            <span
              className={cn(
                styles.phaseIndicator,
                isSelected ? styles.phaseIndicatorLine : styles.phaseIndicatorDot,
                dotClass,
              )}
              aria-hidden="true"
              data-phase-indicator={isSelected ? "line" : "dot"}
            />
            <span className={styles.phaseLabel}>{phaseLabel(phase.phaseNumber)}</span>
          </button>
        )
      })}
    </div>
  )
}

function SidebarContent({ projectId }: SidebarProps) {
  const orchestrationsResult = useTypedQuery(OrchestrationListQuery, {})
  const { orchestrationId, phaseId, selectOrchestration, selectPhase } = useSelection()
  const [deletingOrchestrationId, setDeletingOrchestrationId] = useState<string | null>(null)

  const projectOrchestrations = useMemo(() => {
    if (orchestrationsResult.status !== "success") {
      return []
    }

    return orchestrationsResult.data.filter((orchestration: OrchestrationSummary) => {
      return Option.getOrUndefined(orchestration.projectId) === projectId
    })
  }, [orchestrationsResult, projectId])

  const { activeIndex, getItemProps, activeDescendantId } = useRovingSection({
    sectionId: "observe-sidebar",
    itemCount: projectOrchestrations.length,
    getItemDomId: (index) => `observe-sidebar-item-${index}`,
  })

  useIndexedAction({
    id: "observe-sidebar.select",
    label: "Select Orchestration",
    key: "Enter",
    when: "sidebar.focused",
    items: projectOrchestrations,
    activeIndex,
    execute: (orchestration) => {
      selectOrchestration(orchestration._id)
    },
  })

  if (isAnyQueryLoading(orchestrationsResult)) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.loading}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(orchestrationsResult)
  if (queryError) {
    throw queryError
  }

  if (orchestrationsResult.status !== "success") {
    return null
  }

  if (projectOrchestrations.length === 0) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.modeHeader}>Observe</div>
        <div className={styles.empty}>No orchestrations for this project.</div>
      </div>
    )
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.modeHeader}>Observe</div>
      <div className={styles.list} role="list" aria-activedescendant={activeDescendantId}>
        {projectOrchestrations.map((orchestration: OrchestrationSummary, index) => {
          const rovingProps = getItemProps(index, `observe-sidebar-item-${index}`)
          const active = orchestration._id === orchestrationId
          const orchestrationStatus = toStatusBadgeStatus(orchestration.status)

          return (
            <div key={orchestration._id}>
              <SidebarItem
                label={orchestration.featureName}
                active={active}
                statusIcon={orchestrationStatusIcon(orchestrationStatus)}
                statusIndicatorSize="large"
                onClick={() => selectOrchestration(orchestration._id)}
                onDelete={() => {
                  if (deletingOrchestrationId !== null) return
                  const shouldClearSelection = orchestration._id === orchestrationId
                  setDeletingOrchestrationId(orchestration._id)

                  void (async () => {
                    try {
                      const { convex } = await import("@/convex")
                      let done = false
                      let attempts = 0
                      const maxAttempts = 25

                      while (!done && attempts < maxAttempts) {
                        attempts += 1
                        const result = await convex.mutation(api.orchestrations.deleteOrchestration, {
                          orchestrationId: orchestration._id as Id<"orchestrations">,
                        })
                        done = result.done
                      }

                      if (!done) {
                        throw new Error("Deletion did not complete")
                      }

                      if (shouldClearSelection) {
                        selectOrchestration(null)
                      }
                    } catch (error) {
                      console.error("Failed to delete orchestration", error)
                    } finally {
                      setDeletingOrchestrationId((current) =>
                        current === orchestration._id ? null : current,
                      )
                    }
                  })()
                }}
                deleting={deletingOrchestrationId === orchestration._id}
                data-orchestration-id={orchestration._id}
                data-sidebar-action={index === 0 ? "true" : undefined}
                {...rovingProps}
                className={styles.orchestrationItem}
              />
              {active && (
                <SelectedOrchestrationPhases
                  orchestrationId={orchestration._id}
                  phaseId={phaseId}
                  onSelectPhase={(selectedPhaseId) => selectPhase(selectedPhaseId)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Sidebar({ projectId }: SidebarProps) {
  return (
    <DataErrorBoundary panelName="observe-sidebar">
      <SidebarContent projectId={projectId} />
    </DataErrorBoundary>
  )
}
