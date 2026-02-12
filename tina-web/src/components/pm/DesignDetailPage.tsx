import { useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { useMutation } from "convex/react"
import { Option } from "effect"
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

  const handleSaved = () => {
    setEditing(false)
  }

  const updateMarkers = useMutation(api.designs.updateDesignMarkers)

  const handleToggleMarker = async (marker: string) => {
    const current = Option.getOrElse(() => [] as string[])(design.completedMarkers)
    const next = current.includes(marker)
      ? current.filter((m: string) => m !== marker)
      : [...current, marker]
    await updateMarkers({
      designId: designId as Id<"designs">,
      completedMarkers: next,
    })
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

      {Option.getOrUndefined(design.complexityPreset) && (
        <div className={styles.section} data-testid="validation-section">
          <h3 className={styles.sectionTitle}>Validation</h3>
          <div className={styles.metadata}>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Complexity</span>
              <span>{Option.getOrUndefined(design.complexityPreset)}</span>
            </div>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Phases</span>
              <span>{Option.getOrElse(() => 0)(design.phaseCount)}</span>
            </div>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Phase Structure</span>
              <span>{Option.getOrElse(() => false)(design.phaseStructureValid) ? "Valid" : "Invalid"}</span>
            </div>
          </div>
          {(() => {
            const required = Option.getOrElse(() => [] as string[])(design.requiredMarkers)
            const completed = Option.getOrElse(() => [] as string[])(design.completedMarkers)
            return required.length > 0 ? (
              <div data-testid="marker-checklist">
                <h4>Markers</h4>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {required.map((marker: string) => (
                    <li key={marker} style={{ padding: "4px 0" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={completed.includes(marker)}
                          onChange={() => handleToggleMarker(marker)}
                        />
                        <span style={{ textTransform: "capitalize" }}>
                          {marker.replace(/_/g, " ")}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          })()}
        </div>
      )}

      {editing && (
        <EditDesignModal
          design={design}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
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
