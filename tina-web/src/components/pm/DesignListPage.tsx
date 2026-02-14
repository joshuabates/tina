import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { formatRelativeTimeShort } from "@/lib/time"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, statusLabel } from "@/components/ui/status-styles"
import { CreateDesignModal } from "./CreateDesignModal"
import type { DesignSummary } from "@/schemas"
import styles from "./DesignListPage.module.scss"

export function DesignListPage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const projectId = projectIdParam ?? null

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId: projectId as string,
  })

  if (!projectId) {
    return (
      <div data-testid="design-list-page" className={styles.designList}>
        <div className={styles.noProject}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(designsResult)) {
    return (
      <div data-testid="design-list-page" className={styles.designList}>
        <div data-testid="design-list-loading" className={styles.loading}>
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(designsResult)
  if (queryError) {
    throw queryError
  }

  if (designsResult.status !== "success") {
    return null
  }

  const designs = designsResult.data

  const handleRowClick = (design: DesignSummary) => {
    navigate(`/projects/${projectId}/design/${design._id}`)
  }

  const handleCreated = (designId: string) => {
    setShowCreateForm(false)
    navigate(`/projects/${projectId}/design/${designId}`)
  }

  return (
    <div data-testid="design-list-page" className={styles.designList}>
      <div className={styles.header}>
        <h2 className={styles.title}>Designs</h2>
        <button
          className={styles.createButton}
          onClick={() => setShowCreateForm((open) => !open)}
        >
          Create Design
        </button>
      </div>

      {showCreateForm && (
        <CreateDesignModal
          projectId={projectId}
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}

      {designs.length === 0 ? (
        <div className={styles.empty}>No designs yet. Create one to get started.</div>
      ) : (
        <table className={styles.table} role="table">
          <thead>
            <tr>
              <th>Design</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {designs.map((design) => (
              <tr
                key={design._id}
                onClick={() => handleRowClick(design)}
                role="row"
              >
                <td>
                  <div className={styles.designKey}>{design.designKey}</div>
                  <div className={styles.designTitle}>{design.title}</div>
                </td>
                <td>
                  <StatusBadge
                    status={toStatusBadgeStatus(design.status)}
                    label={statusLabel(toStatusBadgeStatus(design.status))}
                  />
                </td>
                <td>{formatRelativeTimeShort(design.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
