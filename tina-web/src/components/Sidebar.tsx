import { useMemo, useState } from "react"
import { Option } from "effect"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { DataErrorBoundary } from "./DataErrorBoundary"
import { SidebarItem } from "./ui/sidebar-item"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useSelection } from "@/hooks/useSelection"
import { useIndexedAction } from "@/hooks/useIndexedAction"
import { useRovingSection } from "@/hooks/useRovingSection"
import { OrchestrationListQuery } from "@/services/data/queryDefs"
import { toStatusBadgeStatus, statusIconBgClass } from "@/components/ui/status-styles"
import { firstQueryError, isAnyQueryLoading } from "@/lib/query-state"
import type { OrchestrationSummary } from "@/schemas"
import styles from "./Sidebar.module.scss"

interface SidebarProps {
  projectId: string
}

function SidebarContent({ projectId }: SidebarProps) {
  const orchestrationsResult = useTypedQuery(OrchestrationListQuery, {})
  const { orchestrationId, selectOrchestration } = useSelection()
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

          return (
            <SidebarItem
              key={orchestration._id}
              label={orchestration.featureName}
              active={active}
              statusIndicatorClass={statusIconBgClass(
                toStatusBadgeStatus(orchestration.status),
              ).replace("phase-glow", "")}
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
