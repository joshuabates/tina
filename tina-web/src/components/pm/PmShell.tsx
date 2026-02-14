import { Outlet, useParams } from "react-router-dom"
import { useMemo, useState, type ReactNode } from "react"
import { DataErrorBoundary } from "../DataErrorBoundary"
import { LaunchModal } from "./LaunchModal"
import { useAppShellHeader } from "../AppShellHeaderContext"
import { PlanHeaderActionsProvider } from "./PlanHeaderActionsContext"
import styles from "./PmShell.module.scss"

function WorkspaceContent({
  projectId,
}: {
  projectId: string
}) {
  const [showLaunchModal, setShowLaunchModal] = useState(false)
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null)
  const shellHeader = useMemo(
    () => (
      <div className={styles.workspaceHeader}>
        <div className={styles.workspaceHeaderLeft}>
          {headerActions}
        </div>
        <button className={styles.launchButton} onClick={() => setShowLaunchModal(true)}>
          Launch
        </button>
      </div>
    ),
    [headerActions],
  )

  useAppShellHeader(shellHeader, [shellHeader])

  return (
    <>
      <PlanHeaderActionsProvider setHeaderActions={setHeaderActions}>
        <div role="tabpanel">
          <Outlet />
        </div>
      </PlanHeaderActionsProvider>
      {showLaunchModal && (
        <LaunchModal projectId={projectId} onClose={() => setShowLaunchModal(false)} />
      )}
    </>
  )
}

function PmWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()

  if (!projectId) {
    return <div className={styles.noProject}>Select a project from the header</div>
  }

  return <WorkspaceContent projectId={projectId} />
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
