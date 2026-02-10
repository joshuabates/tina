import { useMemo } from "react"
import { Option } from "effect"
import { DataErrorBoundary } from "./DataErrorBoundary"
import { SidebarNav, type SidebarProject } from "./ui/sidebar-nav"
import type { SidebarItemProps } from "./ui/sidebar-item"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useFocusable } from "@/hooks/useFocusable"
import { useSelection } from "@/hooks/useSelection"
import { useActionRegistration } from "@/hooks/useActionRegistration"
import { ProjectListQuery, OrchestrationListQuery } from "@/services/data/queryDefs"
import { normalizeStatus, statusColor } from "@/services/data/status"
import styles from "./Sidebar.module.scss"

interface SidebarProps {
  collapsed: boolean
}

function SidebarContent({ collapsed }: SidebarProps) {
  const projectsResult = useTypedQuery(ProjectListQuery, {})
  const orchestrationsResult = useTypedQuery(OrchestrationListQuery, {})
  const { orchestrationId, selectOrchestration } = useSelection()

  // Flat array of orchestrations for keyboard navigation
  const orchestrations = useMemo(() => {
    if (orchestrationsResult.status === "success") {
      return [...orchestrationsResult.data] // Spread to make mutable copy
    }
    return []
  }, [orchestrationsResult])

  // Calculate total orchestrations for focus registration
  const orchestrationCount = orchestrations.length

  const { isSectionFocused, activeIndex } = useFocusable("sidebar", orchestrationCount)

  // Register Enter action for selecting orchestration
  useActionRegistration({
    id: "sidebar.select",
    label: "Select Orchestration",
    key: "Enter",
    when: "sidebar.focused",
    execute: () => {
      if (activeIndex >= 0 && activeIndex < orchestrations.length) {
        selectOrchestration(orchestrations[activeIndex]._id)
      }
    },
  })

  // Group orchestrations by project with keyboard navigation data
  const projects = useMemo<SidebarProject[]>(() => {
    if (
      projectsResult.status !== "success" ||
      orchestrationsResult.status !== "success"
    ) {
      return []
    }

    const projectMap = new Map<string, SidebarProject>()
    const ungroupedItems: SidebarItemProps[] = []

    // Initialize projects
    for (const project of projectsResult.data) {
      projectMap.set(project._id, {
        name: project.name,
        active: false,
        items: [],
      })
    }

    // Group orchestrations (with index for keyboard navigation)
    let globalIndex = 0
    for (const orchestration of orchestrationsResult.data) {
      const itemIndex = globalIndex++
      const isActive = itemIndex === activeIndex && isSectionFocused

      const item: SidebarItemProps = {
        label: orchestration.featureName,
        active: orchestration._id === orchestrationId,
        statusText: normalizeStatus(orchestration.status),
        statusColor: statusColor(orchestration.status),
        onClick: () => selectOrchestration(orchestration._id),
        // Keyboard navigation attributes
        "data-orchestration-id": orchestration._id,
        id: `sidebar-item-${itemIndex}`,
        tabIndex: isActive ? 0 : -1,
        className: isActive ? "ring-2 ring-primary" : undefined,
      }

      if (Option.isSome(orchestration.projectId)) {
        const projectId = orchestration.projectId.value
        const project = projectMap.get(projectId)
        if (project) {
          project.items.push(item)
        } else {
          ungroupedItems.push(item)
        }
      } else {
        ungroupedItems.push(item)
      }
    }

    const result = Array.from(projectMap.values())

    // Add ungrouped section if there are ungrouped orchestrations
    if (ungroupedItems.length > 0) {
      result.push({
        name: "Ungrouped",
        active: false,
        items: ungroupedItems,
      })
    }

    return result
  }, [projectsResult, orchestrationsResult, orchestrationId, selectOrchestration, activeIndex, isSectionFocused])

  if (projectsResult.status === "loading" || orchestrationsResult.status === "loading") {
    return (
      <div className={styles.sidebar}>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  if (projectsResult.status === "error") {
    throw projectsResult.error
  }

  if (orchestrationsResult.status === "error") {
    throw orchestrationsResult.error
  }

  if (projects.length === 0 && orchestrationCount === 0) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.empty}>No orchestrations found</div>
      </div>
    )
  }

  const activeDescendantId = isSectionFocused && activeIndex >= 0
    ? `sidebar-item-${activeIndex}`
    : undefined

  return (
    <div className={styles.sidebar} data-collapsed={collapsed}>
      <SidebarNav projects={projects} activeDescendantId={activeDescendantId} />
    </div>
  )
}

export function Sidebar({ collapsed }: SidebarProps) {
  return (
    <DataErrorBoundary panelName="sidebar">
      <SidebarContent collapsed={collapsed} />
    </DataErrorBoundary>
  )
}
