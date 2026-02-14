import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useMutation } from "convex/react"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { SpecDetailQuery, LinkedDesignsQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import { CommentTimeline } from "./CommentTimeline"
import { EditSpecModal } from "./EditSpecModal"
import type { Id } from "@convex/_generated/dataModel"
import { useCreateSession } from "@/hooks/useCreateSession"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import styles from "./SpecDetailPage.module.scss"
import markdownStyles from "../PlanQuicklook.module.scss"

const SPEC_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  archived: "Archived",
}

function specStatusLabel(status: string): string {
  return SPEC_STATUS_LABELS[status] ?? status
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

export function SpecDetailPage() {
  const { specId, projectId: routeProjectId } = useParams<{
    specId: string
    projectId: string
  }>()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [transitioning, setTransitioning] = useState(false)

  const transitionSpec = useMutation(api.specs.transitionSpec)
  const updateMarkers = useMutation(api.specs.updateSpecMarkers)
  const { createAndConnect } = useCreateSession()

  const specResult = useTypedQuery(SpecDetailQuery, {
    specId: specId ?? "",
  })

  const linkedDesignsResult = useTypedQuery(LinkedDesignsQuery, {
    specId: specId ?? "",
  })

  if (isAnyQueryLoading(specResult)) {
    return (
      <div data-testid="spec-detail-page" className={styles.detailPage}>
        <div data-testid="spec-detail-loading" className={styles.loading}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(specResult)
  if (queryError) {
    throw queryError
  }

  if (specResult.status !== "success") {
    return null
  }

  const spec = specResult.data
  if (!spec) {
    return (
      <div data-testid="spec-detail-page" className={styles.detailPage}>
        <div className={styles.notFound}>Spec not found</div>
      </div>
    )
  }

  const handleTransition = async (newStatus: string) => {
    setTransitioning(true)
    try {
      await transitionSpec({
        specId: specId as Id<"specs">,
        newStatus,
      })
    } finally {
      setTransitioning(false)
    }
  }

  const handleSaved = () => {
    setEditing(false)
  }

  const handleDiscussSpec = () => {
    createAndConnect({
      label: `Discuss: ${spec.title}`,
      contextType: "spec",
      contextId: specId!,
      contextSummary: spec.markdown.slice(0, 2000),
    })
  }

  const actions = getTransitionActions(spec.status)
  const complexityPreset = Option.getOrUndefined(spec.complexityPreset)
  const requiredMarkers = Option.getOrElse(() => [] as string[])(spec.requiredMarkers)
  const completedMarkers = Option.getOrElse(() => [] as string[])(spec.completedMarkers)

  const handleToggleMarker = async (marker: string) => {
    const next = completedMarkers.includes(marker)
      ? completedMarkers.filter((m: string) => m !== marker)
      : [...completedMarkers, marker]
    await updateMarkers({
      specId: specId as Id<"specs">,
      completedMarkers: next,
    })
  }

  return (
    <div data-testid="spec-detail-page" className={styles.detailPage}>
      <div className={styles.detailHeader}>
        <span className={styles.specKey}>{spec.specKey}</span>
        <h2 className={styles.detailTitle}>{spec.title}</h2>
        <StatusBadge
          status={toStatusBadgeStatus(spec.status)}
          label={specStatusLabel(spec.status)}
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
        <button
          className={styles.actionButton}
          onClick={handleDiscussSpec}
        >
          Discuss Spec
        </button>
        {!editing && (
          <button
            className={styles.actionButton}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        )}
      </div>

      <MarkdownRenderer className={`${styles.markdownBody} ${markdownStyles.content}`}>
        {spec.markdown}
      </MarkdownRenderer>

      {complexityPreset && (
        <div className={styles.section} data-testid="validation-section">
          <h3 className={styles.sectionTitle}>Validation</h3>
          <div className={styles.metadata}>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Complexity</span>
              <span>{complexityPreset}</span>
            </div>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Phases</span>
              <span>{Option.getOrElse(() => 0)(spec.phaseCount)}</span>
            </div>
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Phase Structure</span>
              <span>{Option.getOrElse(() => false)(spec.phaseStructureValid) ? "Valid" : "Invalid"}</span>
            </div>
          </div>
          {requiredMarkers.length > 0 && (
            <div data-testid="marker-checklist">
              <h4>Markers</h4>
              <ul className={styles.markerList}>
                {requiredMarkers.map((marker: string) => (
                  <li key={marker} className={styles.markerItem}>
                    <label className={styles.markerLabel}>
                      <input
                        type="checkbox"
                        checked={completedMarkers.includes(marker)}
                        onChange={() => handleToggleMarker(marker)}
                      />
                      <span className={styles.markerText}>
                        {marker.replace(/_/g, " ")}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className={styles.section} data-testid="linked-designs-section">
        <h3 className={styles.sectionTitle}>Linked Designs</h3>
        {linkedDesignsResult.status === "success" && linkedDesignsResult.data.length > 0 ? (
          <ul className={styles.linkedList}>
            {linkedDesignsResult.data.map((design) => (
              <li key={design._id} className={styles.linkedItem}>
                <button
                  className={styles.linkedLink}
                  onClick={() => navigate(`/projects/${routeProjectId}/plan/designs/${design._id}`)}
                >
                  <span className={styles.linkedKey}>{design.designKey}</span>
                  <span>{design.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyHint}>No linked designs.</p>
        )}
      </div>

      {editing && (
        <EditSpecModal
          spec={spec}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Comments</h3>
        <CommentTimeline
          projectId={routeProjectId || spec.projectId}
          targetType="spec"
          targetId={specId ?? ""}
        />
      </div>
    </div>
  )
}
