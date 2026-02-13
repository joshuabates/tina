import { Outlet, useParams } from "react-router-dom"
import { useState } from "react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ProjectListQuery } from "@/services/data/queryDefs"
import { DataErrorBoundary } from "../DataErrorBoundary"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { LaunchModal } from "./LaunchModal"
import type { ProjectSummary } from "@/schemas"
import styles from "./PmShell.module.scss"

function WorkspaceContent({
  projectId,
  projectName,
}: {
  projectId: string
  projectName: string
}) {
  const [showLaunchModal, setShowLaunchModal] = useState(false)

  return (
    <>
      <div className={styles.workspaceHeader}>
        <h2 className={styles.projectTitle}>{projectName}</h2>
        <button className={styles.launchButton} onClick={() => setShowLaunchModal(true)}>
          Launch
        </button>
      </div>
      <div role="tabpanel">
        <Outlet />
      </div>
      {showLaunchModal && (
        <LaunchModal projectId={projectId} onClose={() => setShowLaunchModal(false)} />
      )}
    </>
  )
}

function PmWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const projectsResult = useTypedQuery(ProjectListQuery, {})

  if (!projectId) {
    return <div className={styles.noProject}>Select a project from the header</div>
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

  const project = projectsResult.data.find((item: ProjectSummary) => item._id === projectId)
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
