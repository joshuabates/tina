import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Option } from "effect"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { DataErrorBoundary } from "./DataErrorBoundary"
import { SidebarNav, type SidebarProject } from "./ui/sidebar-nav"
import type { SidebarItemProps } from "./ui/sidebar-item"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useSelection } from "@/hooks/useSelection"
import { useIndexedAction } from "@/hooks/useIndexedAction"
import { useRovingSection } from "@/hooks/useRovingSection"
import { ProjectListQuery, OrchestrationListQuery } from "@/services/data/queryDefs"
import {
  statusLabel,
  statusTextClass,
  toStatusBadgeStatus,
} from "@/components/ui/status-styles"
import { firstQueryError, isAnyQueryLoading } from "@/lib/query-state"
import styles from "./Sidebar.module.scss"

function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase()
}

function basenameFromPath(path: string): string {
  const normalized = path.replace(/\/+$/, "")
  const segments = normalized.split("/")
  return segments[segments.length - 1] ?? normalized
}

function branchSuffix(branch: string): string {
  const segments = branch.split("/")
  return segments[segments.length - 1] ?? branch
}

function SidebarContent() {
  const projectsResult = useTypedQuery(ProjectListQuery, {})
  const orchestrationsResult = useTypedQuery(OrchestrationListQuery, {})
  const { orchestrationId, selectOrchestration } = useSelection()
  const navigate = useNavigate()
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)

  // Flat array of orchestrations for keyboard navigation
  const orchestrations = useMemo(() => {
    if (orchestrationsResult.status === "success") {
      return [...orchestrationsResult.data] // Spread to make mutable copy
    }
    return []
  }, [orchestrationsResult])

  // Calculate total orchestrations for focus registration
  const orchestrationCount = orchestrations.length

  const { activeIndex, getItemProps, activeDescendantId } = useRovingSection({
    sectionId: "sidebar",
    itemCount: orchestrationCount,
    getItemDomId: (index) => `sidebar-item-${index}`,
  })

  // Register Enter action for selecting orchestration
  useIndexedAction({
    id: "sidebar.select",
    label: "Select Orchestration",
    key: "Enter",
    when: "sidebar.focused",
    items: orchestrations,
    activeIndex,
    execute: (orchestration) => {
      selectOrchestration(orchestration._id)
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
    const projectLookup = new Map<string, SidebarProject>()
    const ungroupedItems: SidebarItemProps[] = []

    const registerProjectAlias = (alias: string | undefined, project: SidebarProject) => {
      if (!alias) return
      const normalized = normalizeLookupKey(alias)
      if (!normalized) return
      if (!projectLookup.has(normalized)) {
        projectLookup.set(normalized, project)
      }
    }

    const resolveProject = (
      projectId: string,
      worktreePath: string | undefined,
      branch: string,
    ): SidebarProject | undefined => {
      const candidates = [
        projectId,
        basenameFromPath(projectId),
        worktreePath,
        worktreePath ? basenameFromPath(worktreePath) : undefined,
        branch,
        branchSuffix(branch),
      ]

      for (const candidate of candidates) {
        if (!candidate) continue
        const project = projectLookup.get(normalizeLookupKey(candidate))
        if (project) return project
      }
      return undefined
    }

    // Initialize projects
    for (const project of projectsResult.data) {
      const sidebarProject: SidebarProject = {
        id: project._id,
        name: project.name,
        active: false,
        deleting: deletingProjectId === project._id,
        onDelete: () => {
          if (deletingProjectId !== null) return
          const shouldClearSelection = sidebarProject.items.some((item) => item.active === true)
          setDeletingProjectId(project._id)
          void (async () => {
            try {
              const { convex } = await import("@/convex")
              await convex.mutation(api.projects.deleteProject, {
                projectId: project._id as Id<"projects">,
              })
              if (shouldClearSelection) {
                selectOrchestration(null)
              }
            } catch (error) {
              console.error("Failed to delete project", error)
            } finally {
              setDeletingProjectId((current) => (current === project._id ? null : current))
            }
          })()
        },
        items: [],
      }
      projectMap.set(project._id, sidebarProject)
      registerProjectAlias(project._id, sidebarProject)
      registerProjectAlias(project.name, sidebarProject)
      registerProjectAlias(project.repoPath, sidebarProject)
      registerProjectAlias(basenameFromPath(project.repoPath), sidebarProject)
    }

    // Group orchestrations (with index for keyboard navigation)
    let globalIndex = 0
    for (const orchestration of orchestrationsResult.data) {
      const itemIndex = globalIndex++
      const rovingProps = getItemProps(itemIndex, `sidebar-item-${itemIndex}`)

      const item: SidebarItemProps = {
        label: orchestration.featureName,
        active: orchestration._id === orchestrationId,
        statusText: statusLabel(toStatusBadgeStatus(orchestration.status)),
        statusColor: statusTextClass(toStatusBadgeStatus(orchestration.status)),
        onClick: () => selectOrchestration(orchestration._id),
        "data-orchestration-id": orchestration._id,
        ...rovingProps,
        className: undefined,
      }

      if (Option.isSome(orchestration.projectId)) {
        const projectId = orchestration.projectId.value
        const project = resolveProject(
          projectId,
          Option.getOrUndefined(orchestration.worktreePath),
          orchestration.branch,
        )
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

    for (const project of result) {
      project.active = project.items.some((item) => item.active === true)
      project.onClick = () => navigate(`/pm?project=${project.id}`)
    }

    // Add ungrouped section if there are ungrouped orchestrations
    if (ungroupedItems.length > 0) {
      result.push({
        id: "ungrouped",
        name: "Ungrouped",
        active: ungroupedItems.some((item) => item.active === true),
        onClick: ungroupedItems[0]?.onClick,
        items: ungroupedItems,
      })
    }

    return result
  }, [
    deletingProjectId,
    projectsResult,
    orchestrationsResult,
    orchestrationId,
    selectOrchestration,
    getItemProps,
    navigate,
  ])

  if (isAnyQueryLoading(projectsResult, orchestrationsResult)) {
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

  const queryError = firstQueryError(projectsResult, orchestrationsResult)
  if (queryError) {
    throw queryError
  }

  if (projects.length === 0 && orchestrationCount === 0) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.empty}>No orchestrations found</div>
      </div>
    )
  }

  return (
    <div className={styles.sidebar}>
      <Link to="/pm" className={styles.pmLink}>Work Graph</Link>
      <SidebarNav projects={projects} activeDescendantId={activeDescendantId} />
    </div>
  )
}

export function Sidebar() {
  return (
    <DataErrorBoundary panelName="sidebar">
      <SidebarContent />
    </DataErrorBoundary>
  )
}
