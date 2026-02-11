import { Outlet, Link, useSearchParams, useLocation } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ProjectListQuery } from "@/services/data/queryDefs"
import { DataErrorBoundary } from "../DataErrorBoundary"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import type { ProjectSummary } from "@/schemas"
import styles from "./PmShell.module.scss"

function PmSidebar() {
  const projectsResult = useTypedQuery(ProjectListQuery, {})
  const [searchParams] = useSearchParams()
  const location = useLocation()

  const activeProjectId = searchParams.get("project")
  const currentPath = location.pathname

  if (isAnyQueryLoading(projectsResult)) {
    return (
      <div className={styles.loading}>
        <div className={styles.skeletonBar} />
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

  const projects = projectsResult.data

  if (projects.length === 0) {
    return <div className={styles.empty}>No projects found</div>
  }

  return (
    <div className={styles.projectList}>
      {projects.map((project: ProjectSummary) => {
        const isActive = activeProjectId === project._id
        const ticketsPath = `/pm/tickets?project=${project._id}`
        const designsPath = `/pm/designs?project=${project._id}`

        const isTicketsActive =
          isActive && currentPath.startsWith("/pm/tickets")
        const isDesignsActive =
          isActive && currentPath.startsWith("/pm/designs")

        return (
          <div key={project._id} className={styles.projectGroup}>
            <div
              className={styles.projectName}
              data-active={isActive}
            >
              {project.name}
            </div>
            <Link
              to={ticketsPath}
              className={styles.entityRow}
              aria-current={isTicketsActive ? "page" : undefined}
            >
              Tickets
            </Link>
            <Link
              to={designsPath}
              className={styles.entityRow}
              aria-current={isDesignsActive ? "page" : undefined}
            >
              Designs
            </Link>
          </div>
        )
      })}
    </div>
  )
}

export function PmShell() {
  return (
    <div data-testid="pm-shell" className={styles.pmShell}>
      <nav
        className={styles.pmSidebar}
        role="navigation"
        aria-label="Project navigation"
      >
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Projects</span>
        </div>
        <DataErrorBoundary panelName="pm-sidebar">
          <PmSidebar />
        </DataErrorBoundary>
      </nav>
      <div className={styles.pmContent}>
        <Outlet />
      </div>
    </div>
  )
}
