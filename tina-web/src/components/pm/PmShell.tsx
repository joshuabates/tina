import { useState } from "react"
import { Outlet, useSearchParams, useLocation } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ProjectListQuery } from "@/services/data/queryDefs"
import { DataErrorBoundary } from "../DataErrorBoundary"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { TicketListPage } from "./TicketListPage"
import { DesignListPage } from "./DesignListPage"
import { LaunchModal } from "./LaunchModal"
import type { ProjectSummary } from "@/schemas"
import styles from "./PmShell.module.scss"

type TabMode = "tickets" | "designs"

function WorkspaceContent({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [activeTab, setActiveTab] = useState<TabMode>("tickets")
  const [showLaunchModal, setShowLaunchModal] = useState(false)

  return (
    <>
      <div className={styles.workspaceHeader}>
        <h2 className={styles.projectTitle}>{projectName}</h2>
        <div className={styles.segmentedControl} role="tablist" aria-label="PM workspace tabs">
          <button
            role="tab"
            aria-selected={activeTab === "tickets"}
            className={`${styles.segment}${activeTab === "tickets" ? ` ${styles.segmentActive}` : ""}`}
            onClick={() => setActiveTab("tickets")}
          >
            Tickets
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "designs"}
            className={`${styles.segment}${activeTab === "designs" ? ` ${styles.segmentActive}` : ""}`}
            onClick={() => setActiveTab("designs")}
          >
            Designs
          </button>
        </div>
        <button
          className={styles.launchButton}
          onClick={() => setShowLaunchModal(true)}
        >
          Launch
        </button>
      </div>
      <div role="tabpanel">
        {activeTab === "tickets" ? <TicketListPage /> : <DesignListPage />}
      </div>
      {showLaunchModal && (
        <LaunchModal projectId={projectId} onClose={() => setShowLaunchModal(false)} />
      )}
    </>
  )
}

function PmWorkspace() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const projectId = searchParams.get("project")

  const projectsResult = useTypedQuery(ProjectListQuery, {})

  // Detail routes render via Outlet
  const isDetailRoute =
    location.pathname.startsWith("/pm/designs/") ||
    location.pathname.startsWith("/pm/tickets/")

  if (isDetailRoute) {
    return <Outlet />
  }

  if (!projectId) {
    return (
      <div className={styles.noProject}>Select a project from the sidebar</div>
    )
  }

  if (isAnyQueryLoading(projectsResult)) {
    return (
      <div className={styles.loading}>
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonBar} />
      </div>
    )
  }

  const queryError = firstQueryError(projectsResult)
  if (queryError) {
    throw queryError
  }

  if (projectsResult.status !== "success") {
    return null
  }

  const project = projectsResult.data.find((p: ProjectSummary) => p._id === projectId)
  const projectName = project?.name ?? "Unknown Project"

  return <WorkspaceContent projectId={projectId} projectName={projectName} />
}

export function PmShell() {
  return (
    <div data-testid="pm-shell" className={styles.pmShell}>
      <DataErrorBoundary panelName="pm-workspace">
        <PmWorkspace />
      </DataErrorBoundary>
    </div>
  )
}
