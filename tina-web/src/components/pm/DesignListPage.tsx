import { useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { formatRelativeTimeShort } from "@/lib/time"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, statusLabel } from "@/components/ui/status-styles"
import type { DesignSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "./DesignListPage.module.scss"

function DesignCreateForm({
  projectId,
  onCancel,
  onCreated,
}: {
  projectId: string
  onCancel: () => void
  onCreated: (designId: string) => void
}) {
  const [title, setTitle] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const createDesign = useMutation(api.designs.createDesign)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const designId = await createDesign({
        projectId: projectId as Id<"projects">,
        title: title.trim(),
        markdown: markdown.trim(),
      })
      onCreated(designId as unknown as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create design")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.createForm} onSubmit={handleSubmit} data-testid="design-create-form">
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="design-title">Title</label>
        <input
          id="design-title"
          className={styles.formInput}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Design title"
          autoFocus
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="design-markdown">Content</label>
        <textarea
          id="design-markdown"
          className={styles.formTextarea}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder="Design content (markdown)"
        />
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={!title.trim() || submitting}
        >
          {submitting ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export function DesignListPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const projectId = searchParams.get("project")

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId: projectId ?? "",
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
        <div className={styles.header}>
          <h2 className={styles.title}>Designs</h2>
        </div>
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
    navigate(`/pm/designs/${design._id}?project=${projectId}`)
  }

  const handleCreated = (designId: string) => {
    setShowCreateForm(false)
    navigate(`/pm/designs/${designId}?project=${projectId}`)
  }

  return (
    <div data-testid="design-list-page" className={styles.designList}>
      <div className={styles.header}>
        <h2 className={styles.title}>Designs</h2>
        <button
          className={styles.createButton}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          Create Design
        </button>
      </div>

      {showCreateForm && (
        <DesignCreateForm
          projectId={projectId}
          onCancel={() => setShowCreateForm(false)}
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
