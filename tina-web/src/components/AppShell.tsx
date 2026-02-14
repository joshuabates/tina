import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { Option } from "effect"
import { Activity, ClipboardList, Code2, MessageSquare, PenTool } from "lucide-react"
import { AppStatusBar } from "./ui/app-status-bar"
import { Sidebar } from "./Sidebar"
import { useSelection } from "@/hooks/useSelection"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { SidebarListLayout } from "./ui/sidebar-list-layout"
import { firstQueryError, isAnyQueryLoading } from "@/lib/query-state"
import {
  buildModePath,
  parseModeFromPathname,
  resolveProjectModeTarget,
  setLastModeForProject,
  setLastProjectId,
  setLastSubviewForProjectMode,
  type NavMode,
} from "@/lib/navigation"
import { OrchestrationListQuery, ProjectListQuery, TerminalTargetListQuery } from "@/services/data/queryDefs"
import type { OrchestrationSummary, ProjectSummary, TerminalTarget } from "@/schemas"
import { SidebarItem } from "@/components/ui/sidebar-item"
import { NewSessionDialog } from "@/components/NewSessionDialog"
import { statusLabel, toStatusBadgeStatus } from "@/components/ui/status-styles"
import { AppShellHeaderProvider } from "./AppShellHeaderContext"
import styles from "./AppShell.module.scss"

interface ModeConfig {
  mode: NavMode
  label: string
  icon: typeof Activity
}

const MODE_CONFIGS: readonly ModeConfig[] = [
  { mode: "observe", label: "Observe", icon: Activity },
  { mode: "sessions", label: "Sessions", icon: MessageSquare },
  { mode: "plan", label: "Plan", icon: ClipboardList },
  { mode: "code", label: "Code", icon: Code2 },
  { mode: "design", label: "Design", icon: PenTool },
] as const

function modeLabel(mode: NavMode): string {
  return MODE_CONFIGS.find((item) => item.mode === mode)?.label ?? mode
}

function SessionsSidebar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showNewSession, setShowNewSession] = useState(false)
  const targetsResult = useTypedQuery(TerminalTargetListQuery, {})
  const activePaneId = searchParams.get("pane")
  const sessionTargets = targetsResult.status === "success"
    ? targetsResult.data
    : []
  const hasTargets = sessionTargets.length > 0

  return (
    <SidebarListLayout
      title="Sessions"
      bodyProps={hasTargets ? { role: "list" } : undefined}
      footer={(
        <button
          type="button"
          className={styles.modeSidebarButton}
          data-sidebar-action
          onClick={() => setShowNewSession(true)}
        >
          New session
        </button>
      )}
    >
      {hasTargets && (
        <>
          {sessionTargets.map((target: TerminalTarget, index) => (
            <SidebarItem
              key={target.id}
              label={target.label}
              active={target.tmuxPaneId === activePaneId}
              statusIndicatorClass={
                target.type === "agent"
                  ? "bg-emerald-500"
                  : "bg-sky-400"
              }
              className={styles.sessionsSidebarItem}
              data-sidebar-action={index === 0 ? "true" : undefined}
              onClick={() => {
                setSearchParams({ pane: target.tmuxPaneId })
              }}
            />
          ))}
        </>
      )}
      {targetsResult.status === "loading" && (
        <p className={styles.sessionsSidebarHint}>
          Loading sessions...
        </p>
      )}
      {targetsResult.status === "success" && targetsResult.data.length === 0 && (
        <p className={styles.sessionsSidebarHint}>
          No active sessions.
        </p>
      )}
      {showNewSession && (
        <NewSessionDialog
          onClose={() => setShowNewSession(false)}
          onCreated={(paneId: string) => {
            setShowNewSession(false)
            setSearchParams({ pane: paneId })
          }}
        />
      )}
    </SidebarListLayout>
  )
}

function CodeSidebar() {
  return (
    <div className={styles.modeSidebarContent}>
      <div className={styles.modeSidebarHeader}>Code</div>
      <p className={styles.modeSidebarHint}>Open a workspace to browse and edit code.</p>
      <button type="button" className={styles.modeSidebarButton} data-sidebar-action>
        Open project root
      </button>
    </div>
  )
}

function DesignSidebar() {
  return (
    <div className={styles.modeSidebarContent}>
      <div className={styles.modeSidebarHeader}>Design</div>
      <p className={styles.modeSidebarHint}>Browse and manage designs for this project.</p>
    </div>
  )
}

function ModeSidebar({ mode, projectId }: { mode: NavMode; projectId: string }) {
  switch (mode) {
    case "observe":
      return <Sidebar projectId={projectId} />
    case "plan":
      return null
    case "sessions":
      return <SessionsSidebar />
    case "code":
      return <CodeSidebar />
    case "design":
      return <DesignSidebar />
  }
}

function resolvePhaseLabel(orchestration: OrchestrationSummary): string {
  const phaseStatus = statusLabel(toStatusBadgeStatus(orchestration.status))
  return `${orchestration.featureName} / P${orchestration.currentPhase} ${phaseStatus}`
}

export function AppShell() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const mode = parseModeFromPathname(location.pathname)
  const hasModeSidebar = mode !== "plan"
  const [headerContent, setHeaderContent] = useState<ReactNode | null>(null)
  const { orchestrationId, selectOrchestration } = useSelection()

  const orchestrationsResult = useTypedQuery(OrchestrationListQuery, {})
  const projectsResult = useTypedQuery(ProjectListQuery, {})

  const selectedProject = useMemo(() => {
    if (!projectId || projectsResult.status !== "success") return undefined
    return projectsResult.data.find((project: ProjectSummary) => project._id === projectId)
  }, [projectId, projectsResult])

  useEffect(() => {
    if (!projectId || !mode) return
    setLastProjectId(projectId)
    setLastModeForProject(projectId, mode)
    setLastSubviewForProjectMode(
      projectId,
      mode,
      `${location.pathname}${location.search}`,
    )
  }, [location.pathname, location.search, mode, projectId])

  useEffect(() => {
    if (!projectId || mode !== "observe" || !orchestrationId) return
    if (orchestrationsResult.status !== "success") return

    const selectedOrchestration = orchestrationsResult.data.find(
      (orchestration: OrchestrationSummary) => orchestration._id === orchestrationId,
    )
    if (!selectedOrchestration) return

    const selectedProjectId = Option.getOrUndefined(selectedOrchestration.projectId)
    if (!selectedProjectId || selectedProjectId === projectId) return

    const nextPath = buildModePath(selectedProjectId, "observe")
    navigate(`${nextPath}${location.search}`, { replace: true })
  }, [
    location.search,
    mode,
    navigate,
    orchestrationId,
    orchestrationsResult,
    projectId,
  ])

  useEffect(() => {
    if (!mode) return

    const focusSidebarFirstAction = () => {
      const root = document.querySelector(
        '[data-mode-sidebar="true"]',
      ) as HTMLElement | null
      if (!root) return

      const target = root.querySelector(
        "[data-sidebar-action], button, a, [tabindex='0']",
      ) as HTMLElement | null
      target?.focus()
    }

    const timer = window.setTimeout(focusSidebarFirstAction, 0)
    return () => window.clearTimeout(timer)
  }, [mode, projectId])

  if (!projectId || !mode) {
    return <Navigate to="/" replace />
  }

  if (projectsResult.status === "success" && !selectedProject) {
    return <Navigate to="/" replace />
  }

  const queryError = firstQueryError(orchestrationsResult, projectsResult)
  if (queryError) {
    throw queryError
  }

  const selectedOrchestration =
    orchestrationId && orchestrationsResult.status === "success"
      ? orchestrationsResult.data.find(
          (orchestration: OrchestrationSummary) => orchestration._id === orchestrationId,
        )
      : undefined

  const selectedOrchestrationProjectId = selectedOrchestration
    ? Option.getOrUndefined(selectedOrchestration.projectId)
    : undefined
  const selectedOrchestrationProjectName =
    selectedOrchestrationProjectId && projectsResult.status === "success"
      ? projectsResult.data.find(
          (project: ProjectSummary) => project._id === selectedOrchestrationProjectId,
        )?.name
      : undefined

  const projectName = selectedOrchestrationProjectName ?? selectedProject?.name
  const phaseName = selectedOrchestration
    ? resolvePhaseLabel(selectedOrchestration)
    : undefined

  const handleProjectChange = (nextProjectId: string) => {
    if (!mode || nextProjectId === projectId) return
    if (mode === "observe") {
      selectOrchestration(null)
    }
    navigate(resolveProjectModeTarget(nextProjectId, mode))
  }

  const handleModeChange = (targetMode: NavMode) => {
    navigate(resolveProjectModeTarget(projectId, targetMode))
  }

  const renderProjectPicker = () => {
    if (isAnyQueryLoading(projectsResult)) {
      return <span className={styles.projectPickerLoading}>Loading projects…</span>
    }

    if (projectsResult.status !== "success" || projectsResult.data.length === 0) {
      return <span className={styles.projectPickerLoading}>No projects</span>
    }

    return (
      <label className={styles.projectPickerLabel}>
        <span className={styles.projectPickerText}>Project</span>
        <select
          className={styles.projectPicker}
          value={projectId}
          onChange={(event) => handleProjectChange(event.target.value)}
          data-testid="project-picker"
        >
          {projectsResult.data.map((project: ProjectSummary) => (
            <option key={project._id} value={project._id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
    )
  }

  const renderRouteHeader = () => {
    if (headerContent) {
      return headerContent
    }

    return (
      <div className={styles.shellHeaderFallback}>
        {modeLabel(mode)}
      </div>
    )
  }

  return (
    <div
      className={
        hasModeSidebar
          ? styles.appShell
          : `${styles.appShell} ${styles.appShellNoSidebar}`
      }
    >
      <nav className={styles.modeRail} aria-label="Mode rail">
        {MODE_CONFIGS.map((entry) => {
          const Icon = entry.icon
          return (
            <button
              key={entry.mode}
              type="button"
              title={entry.label}
              aria-label={entry.label}
              aria-current={mode === entry.mode ? "page" : undefined}
              className={
                mode === entry.mode
                  ? `${styles.modeRailButton} ${styles.modeRailButtonActive}`
                  : styles.modeRailButton
              }
              onClick={() => handleModeChange(entry.mode)}
              data-testid={`mode-rail-${entry.mode}`}
            >
              <Icon className={styles.modeRailIcon} />
            </button>
          )
        })}
      </nav>

      <header
        className={
          hasModeSidebar
            ? styles.shellHeader
            : `${styles.shellHeader} ${styles.shellHeaderNoSidebar}`
        }
        aria-label="Workspace header"
      >
        <div className={styles.shellHeaderProject}>
          {renderProjectPicker()}
        </div>
        <div className={styles.shellHeaderContent}>
          {renderRouteHeader()}
        </div>
      </header>

      {hasModeSidebar && (
        <div
          className={styles.sidebar}
          role="navigation"
          aria-label={`${modeLabel(mode)} sidebar`}
        >
          <div className={styles.sidebarBody} data-mode-sidebar="true">
            <ModeSidebar mode={mode} projectId={projectId} />
          </div>
        </div>
      )}

      <AppShellHeaderProvider setHeaderContent={setHeaderContent}>
        <main className={styles.main} aria-label="Page content">
          <Outlet />
        </main>
      </AppShellHeaderProvider>

      <div className={styles.footer}>
        <AppStatusBar connected={true} projectName={projectName} phaseName={phaseName} />
      </div>
    </div>
  )
}
