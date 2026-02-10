import { useState, useMemo } from "react"
import { Outlet } from "react-router-dom"
import { Option } from "effect"
import { AppHeader } from "./ui/app-header"
import { AppStatusBar } from "./ui/app-status-bar"
import { Sidebar } from "./Sidebar"
import { useSelection } from "@/hooks/useSelection"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useActionRegistration } from "@/hooks/useActionRegistration"
import { OrchestrationListQuery, ProjectListQuery } from "@/services/data/queryDefs"
import type { OrchestrationSummary, ProjectSummary } from "@/schemas"
import styles from "./AppShell.module.scss"

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { orchestrationId } = useSelection()

  const orchestrationsResult = useTypedQuery(OrchestrationListQuery, {})
  const projectsResult = useTypedQuery(ProjectListQuery, {})

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev)
  }

  // Register Alt+b to toggle sidebar collapse
  useActionRegistration({
    id: "sidebar.toggle",
    label: "Toggle Sidebar",
    key: "Alt+b",
    when: "global",
    execute: toggleCollapsed,
  })

  // Find selected orchestration and its project
  const { projectName, phaseName } = useMemo(() => {
    if (!orchestrationId) {
      return { projectName: undefined, phaseName: undefined }
    }

    if (orchestrationsResult.status !== "success" || projectsResult.status !== "success") {
      return { projectName: undefined, phaseName: undefined }
    }

    const orchestration = orchestrationsResult.data.find(
      (o: OrchestrationSummary) => o._id === orchestrationId
    )

    if (!orchestration) {
      return { projectName: undefined, phaseName: undefined }
    }

    // Find project name
    const projectId = Option.getOrUndefined(orchestration.projectId)
    let projectName: string | undefined
    if (projectId) {
      const project = projectsResult.data.find((p: ProjectSummary) => p._id === projectId)
      projectName = project?.name
    }

    // Build breadcrumb: "{featureName} / P{currentPhase} {status}"
    const phaseName = `${orchestration.featureName} / P${orchestration.currentPhase} ${orchestration.status}`

    return { projectName, phaseName }
  }, [orchestrationId, orchestrationsResult, projectsResult])

  return (
    <div className={`${styles.appShell} ${collapsed ? styles.collapsed : ""}`}>
      <div className={styles.header}>
        <AppHeader title="ORCHESTRATOR" version="0.1.0" />
      </div>

      <div
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}
        role="navigation"
        aria-label="Main sidebar"
      >
        <button onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? ">" : "<"}
        </button>
        <Sidebar collapsed={collapsed} />
      </div>

      <main className={styles.main} aria-label="Page content">
        <Outlet />
      </main>

      <div className={styles.footer}>
        <AppStatusBar connected={true} projectName={projectName} phaseName={phaseName} />
      </div>
    </div>
  )
}
