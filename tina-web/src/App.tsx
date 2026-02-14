import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { OrchestrationPage } from "./components/OrchestrationPage"
import { ReviewDetailPage } from "./components/ReviewDetailPage"
import { PmShell } from "./components/pm/PmShell"
import { SpecDetailPage } from "./components/pm/SpecDetailPage"
import { TicketDetailPage } from "./components/pm/TicketDetailPage"
import { TicketListPage } from "./components/pm/TicketListPage"
import { SpecListPage } from "./components/pm/SpecListPage"
import { DesignListPage } from "./components/pm/DesignListPage"
import { DesignDetailPage } from "./components/pm/DesignDetailPage"
import { SessionsModePage } from "./components/modes/SessionsModePage"
import { CodeModePage } from "./components/modes/CodeModePage"
import { DesignModePage } from "./components/modes/DesignModePage"
import { useTypedQuery } from "./hooks/useTypedQuery"
import { ProjectListQuery } from "./services/data/queryDefs"
import { firstQueryError, isAnyQueryLoading } from "./lib/query-state"
import type { ProjectSummary } from "./schemas"
import {
  DEFAULT_MODE,
  getLastModeForProject,
  getLastProjectId,
  resolveProjectModeTarget,
} from "./lib/navigation"

function NavigationLoading() {
  return <div aria-busy="true">Loading navigation…</div>
}

function NoProjectsState() {
  return (
    <div>
      <h1>No projects available</h1>
      <p>Create a project to begin working in Observe, Plan, Sessions, Code, or Design.</p>
    </div>
  )
}

function RootResolver() {
  const projectsResult = useTypedQuery(ProjectListQuery, {})

  if (isAnyQueryLoading(projectsResult)) {
    return <NavigationLoading />
  }

  const queryError = firstQueryError(projectsResult)
  if (queryError) {
    throw queryError
  }

  if (projectsResult.status !== "success") {
    return null
  }

  if (projectsResult.data.length === 0) {
    return <NoProjectsState />
  }

  const lastProjectId = getLastProjectId()
  const selectedProject =
    projectsResult.data.find((project: ProjectSummary) => project._id === lastProjectId) ??
    projectsResult.data[0]

  const initialMode = getLastModeForProject(selectedProject._id) ?? DEFAULT_MODE
  const initialTarget = resolveProjectModeTarget(selectedProject._id, initialMode)

  return <Navigate to={initialTarget} replace />
}

function ProjectModeRedirect() {
  const { projectId } = useParams<{ projectId: string }>()
  const projectsResult = useTypedQuery(ProjectListQuery, {})

  if (isAnyQueryLoading(projectsResult)) {
    return <NavigationLoading />
  }

  const queryError = firstQueryError(projectsResult)
  if (queryError) {
    throw queryError
  }

  if (!projectId || projectsResult.status !== "success") {
    return <Navigate to="/" replace />
  }

  const projectExists = projectsResult.data.some(
    (project: ProjectSummary) => project._id === projectId,
  )
  if (!projectExists) {
    return <Navigate to="/" replace />
  }

  const mode = getLastModeForProject(projectId) ?? DEFAULT_MODE
  const target = resolveProjectModeTarget(projectId, mode)
  return <Navigate to={target} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootResolver />} />
      <Route path="projects/:projectId" element={<ProjectModeRedirect />} />

      <Route path="projects/:projectId/observe" element={<AppShell />}>
        <Route index element={<OrchestrationPage />} />
        <Route
          path="orchestrations/:orchestrationId/reviews/:reviewId"
          element={<ReviewDetailPage />}
        />
      </Route>

      <Route path="projects/:projectId/plan" element={<AppShell />}>
        <Route element={<PmShell />}>
          <Route index element={<Navigate to="tickets" replace />} />
          <Route path="tickets" element={<TicketListPage />} />
          <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
          <Route path="specs" element={<SpecListPage />} />
          <Route path="specs/:specId" element={<SpecDetailPage />} />
          <Route path="designs" element={<DesignListPage />} />
          <Route path="designs/:designId" element={<DesignDetailPage />} />
        </Route>
      </Route>

      <Route path="projects/:projectId/sessions" element={<AppShell />}>
        <Route index element={<SessionsModePage />} />
      </Route>

      <Route path="projects/:projectId/code" element={<AppShell />}>
        <Route index element={<CodeModePage />} />
      </Route>

      <Route path="projects/:projectId/design" element={<AppShell />}>
        <Route index element={<DesignModePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
