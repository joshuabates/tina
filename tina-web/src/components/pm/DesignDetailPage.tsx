import { useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { DesignDetailQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import { CommentTimeline } from "./CommentTimeline"
import { EditDesignModal } from "./EditDesignModal"
import type { Id } from "@convex/_generated/dataModel"
import styles from "./DesignDetailPage.module.scss"

const DESIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  archived: "Archived",
}

function designStatusLabel(status: string): string {
  return DESIGN_STATUS_LABELS[status] ?? status
}

interface TransitionAction {
  label: string
  newStatus: string
  primary?: boolean
}

function getTransitionActions(status: string): TransitionAction[] {
  switch (status) {
    case "draft":
      return [{ label: "Submit for Review", newStatus: "in_review", primary: true }]
    case "in_review":
      return [
        { label: "Approve", newStatus: "approved", primary: true },
        { label: "Return to Draft", newStatus: "draft" },
      ]
    case "approved":
      return [{ label: "Archive", newStatus: "archived" }]
    case "archived":
      return [{ label: "Unarchive", newStatus: "draft" }]
    default:
      return []
  }
}

export function DesignDetailPage() {
  const { designId } = useParams<{ designId: string }>()
  const [searchParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [transitioning, setTransitioning] = useState(false)

  const projectId = searchParams.get("project") || null

  const transitionDesign = useMutation(api.designs.transitionDesign)
  const updateDesign = useMutation(api.designs.updateDesign)

  const designResult = useTypedQuery(DesignDetailQuery, {
    designId: designId ?? "",
  })

  if (isAnyQueryLoading(designResult)) {
    return (
      <div data-testid="design-detail-page" className={styles.detailPage}>
        <div data-testid="design-detail-loading" className={styles.loading}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(designResult)
  if (queryError) {
    throw queryError
  }

  if (designResult.status !== "success") {
    return null
  }

  const design = designResult.data
  if (!design) {
    return (
      <div data-testid="design-detail-page" className={styles.detailPage}>
        <div className={styles.notFound}>Design not found</div>
      </div>
    )
  }

  const handleTransition = async (newStatus: string) => {
    setTransitioning(true)
    try {
      await transitionDesign({
        designId: designId as Id<"designs">,
        newStatus,
      })
    } finally {
      setTransitioning(false)
    }
  }

  const handleSave = async (title: string, markdown: string) => {
    await updateDesign({
      designId: designId as Id<"designs">,
      title,
      markdown,
    })
    setEditing(false)
  }

  const actions = getTransitionActions(design.status)

  return (
    <div data-testid="design-detail-page" className={styles.detailPage}>
      <div className={styles.detailHeader}>
        <span className={styles.designKey}>{design.designKey}</span>
        <h2 className={styles.detailTitle}>{design.title}</h2>
        <StatusBadge
          status={toStatusBadgeStatus(design.status)}
          label={designStatusLabel(design.status)}
        />
      </div>

      <div className={styles.actions}>
        {actions.map((action) => (
          <button
            key={action.newStatus}
            className={`${styles.actionButton}${action.primary ? ` ${styles.primary}` : ""}`}
            onClick={() => handleTransition(action.newStatus)}
            disabled={transitioning}
          >
            {action.label}
          </button>
        ))}
        {!editing && (
          <button
            className={styles.actionButton}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>

      <pre className={styles.markdownBody}>{design.markdown}</pre>
      {editing && (
        <EditDesignModal
          design={design}
          onClose={() => setEditing(false)}
          onSave={handleSave}
        />
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Comments</h3>
        <CommentTimeline
          projectId={projectId || design.projectId}
          targetType="design"
          targetId={designId ?? ""}
        />
      </div>
    </div>
  )
}
