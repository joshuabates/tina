import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { SpecListQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { formatRelativeTimeShort } from "@/lib/time"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, statusLabel } from "@/components/ui/status-styles"
import { CreateSpecModal } from "./CreateSpecModal"
import type { SpecSummary } from "@/schemas"
import styles from "./SpecListPage.module.scss"

export function SpecListPage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const projectId = projectIdParam ?? null

  const specsResult = useTypedQuery(SpecListQuery, {
    projectId: projectId as string,
  })

  if (!projectId) {
    return (
      <div data-testid="spec-list-page" className={styles.specList}>
        <div className={styles.noProject}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(specsResult)) {
    return (
      <div data-testid="spec-list-page" className={styles.specList}>
        <div className={styles.header}>
          <h2 className={styles.title}>Specs</h2>
        </div>
        <div data-testid="spec-list-loading" className={styles.loading}>
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(specsResult)
  if (queryError) {
    throw queryError
  }

  if (specsResult.status !== "success") {
    return null
  }

  const specs = specsResult.data

  const handleRowClick = (spec: SpecSummary) => {
    navigate(`/projects/${projectId}/plan/specs/${spec._id}`)
  }

  const handleCreated = (specId: string) => {
    setShowCreateForm(false)
    navigate(`/projects/${projectId}/plan/specs/${specId}`)
  }

  return (
    <div data-testid="spec-list-page" className={styles.specList}>
      <div className={styles.header}>
        <h2 className={styles.title}>Specs</h2>
        <button
          className={styles.createButton}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          Create Spec
        </button>
      </div>

      {showCreateForm && (
        <CreateSpecModal
          projectId={projectId}
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}

      {specs.length === 0 ? (
        <div className={styles.empty}>No specs yet. Create one to get started.</div>
      ) : (
        <table className={styles.table} role="table">
          <thead>
            <tr>
              <th>Spec</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {specs.map((spec) => (
              <tr
                key={spec._id}
                onClick={() => handleRowClick(spec)}
                role="row"
              >
                <td>
                  <div className={styles.specKey}>{spec.specKey}</div>
                  <div className={styles.specTitle}>{spec.title}</div>
                </td>
                <td>
                  <StatusBadge
                    status={toStatusBadgeStatus(spec.status)}
                    label={statusLabel(toStatusBadgeStatus(spec.status))}
                  />
                </td>
                <td>{formatRelativeTimeShort(spec.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
