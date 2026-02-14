import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { DataErrorBoundary } from "@/components/DataErrorBoundary"
import { useAppShellHeader } from "@/components/AppShellHeaderContext"
import { TerminalView } from "@/components/TerminalView"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TerminalTargetListQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import type { TerminalTarget } from "@/schemas"
import emptyStyles from "./ModeEmptyState.module.scss"

function SessionsContent() {
  const [searchParams] = useSearchParams()
  const paneId = searchParams.get("pane")
  const shellHeader = useMemo(
    () => <span className={emptyStyles.shellTitle}>Sessions</span>,
    [],
  )
  useAppShellHeader(shellHeader)

  const targetsResult = useTypedQuery(TerminalTargetListQuery, {})

  if (isAnyQueryLoading(targetsResult)) {
    return (
      <section data-testid="sessions-mode-page" className={emptyStyles.page}>
        <p className={emptyStyles.description}>Loading sessions...</p>
      </section>
    )
  }

  const queryError = firstQueryError(targetsResult)
  if (queryError) {
    throw queryError
  }

  if (targetsResult.status !== "success") return null

  // If a pane is selected via search params, show terminal view
  if (paneId) {
    const target = targetsResult.data.find(
      (t: TerminalTarget) => t.tmuxPaneId === paneId,
    )

    if (target) {
      return (
        <TerminalView
          paneId={target.tmuxPaneId}
          label={target.label}
          type={target.type}
          cli={target.cli}
          sessionName={target.tmuxSessionName}
        />
      )
    }

    // Pane not found
    return (
      <section data-testid="sessions-mode-page" className={emptyStyles.page}>
        <h1 className={emptyStyles.title}>Session not found</h1>
        <p className={emptyStyles.description}>
          Terminal pane {paneId} is no longer available.
        </p>
      </section>
    )
  }

  // No pane selected — show empty state
  if (targetsResult.data.length === 0) {
    return (
      <section data-testid="sessions-mode-page" className={emptyStyles.page}>
        <p className={emptyStyles.description}>
          No active sessions. Start an orchestration or create a new session.
        </p>
      </section>
    )
  }

  return (
    <section data-testid="sessions-mode-page" className={emptyStyles.page}>
      <p className={emptyStyles.description}>
        Select a session from the sidebar to connect.
      </p>
    </section>
  )
}

export function SessionsModePage() {
  return (
    <DataErrorBoundary panelName="sessions">
      <SessionsContent />
    </DataErrorBoundary>
  )
}
