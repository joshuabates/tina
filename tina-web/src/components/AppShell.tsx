import { useMemo } from "react"
import { Outlet } from "react-router-dom"
import { Option } from "effect"
import { AppHeader } from "./ui/app-header"
import { AppStatusBar } from "./ui/app-status-bar"
import { Sidebar } from "./Sidebar"
import { useSelection } from "@/hooks/useSelection"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { OrchestrationListQuery, ProjectListQuery } from "@/services/data/queryDefs"
import type { OrchestrationSummary, ProjectSummary } from "@/schemas"
import { statusLabel, toStatusBadgeStatus } from "@/components/ui/status-styles"
import styles from "./AppShell.module.scss"

export function AppShell() {
  const { orchestrationId } = useSelection()

  const orchestrationsResult = useTypedQuery(OrchestrationListQuery, {})
  const projectsResult = useTypedQuery(ProjectListQuery, {})

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
    const phaseStatus = statusLabel(toStatusBadgeStatus(orchestration.status))
    const phaseName = `${orchestration.featureName} / P${orchestration.currentPhase} ${phaseStatus}`

    return { projectName, phaseName }
  }, [orchestrationId, orchestrationsResult, projectsResult])

  return (
    <div className={styles.appShell}>
      <div className={styles.header}>
        <AppHeader title="ORCHESTRATOR" version="0.1.0" />
      </div>

      <div
        className={styles.sidebar}
        role="navigation"
        aria-label="Main sidebar"
      >
        <Sidebar />
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
