import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import {
  DesignDetailQuery,
  DesignVariationListQuery,
  LinkedSpecsQuery,
} from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import { CommentTimeline } from "./CommentTimeline"
import type { Id } from "@convex/_generated/dataModel"
import styles from "./DesignDetailPage.module.scss"

const DESIGN_STATUS_LABELS: Record<string, string> = {
  exploring: "Exploring",
  archived: "Archived",
}

const VARIATION_STATUS_LABELS: Record<string, string> = {
  exploring: "Exploring",
  selected: "Selected",
  rejected: "Rejected",
}

function designStatusLabel(status: string): string {
  return DESIGN_STATUS_LABELS[status] ?? status
}

function variationStatusLabel(status: string): string {
  return VARIATION_STATUS_LABELS[status] ?? status
}

interface TransitionAction {
  label: string
  newStatus: string
  primary?: boolean
}

const DESIGN_WORKBENCH_BASE_URL =
  (import.meta.env.VITE_DESIGN_WORKBENCH_URL as string | undefined)?.trim()
  || "http://localhost:5200"

function getTransitionActions(status: string): TransitionAction[] {
  switch (status) {
    case "exploring":
      return [
        { label: "Archive", newStatus: "archived", primary: true },
      ]
    case "archived":
      return [{ label: "Reopen", newStatus: "exploring" }]
    default:
      return []
  }
}

export function DesignDetailPage() {
  const { designId, projectId: routeProjectId } = useParams<{
    designId: string
    projectId: string
  }>()
  const [transitioning, setTransitioning] = useState(false)

  const transitionDesign = useMutation(api.designs.transitionDesign)

  const designResult = useTypedQuery(DesignDetailQuery, {
    designId: designId ?? "",
  })

  const variationsResult = useTypedQuery(DesignVariationListQuery, {
    designId: designId ?? "",
  })

  const linkedSpecsResult = useTypedQuery(LinkedSpecsQuery, {
    designId: designId ?? "",
  })

  if (isAnyQueryLoading(designResult, variationsResult, linkedSpecsResult)) {
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

  const queryError = firstQueryError(
    designResult,
    variationsResult,
    linkedSpecsResult,
  )
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

  const variations =
    variationsResult.status === "success" ? variationsResult.data : []
  const linkedSpecs =
    linkedSpecsResult.status === "success" ? linkedSpecsResult.data : []
  const designSlug = design.slug

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
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Prompt</h3>
        <p className={styles.promptText}>{design.prompt}</p>
      </div>

      {linkedSpecs.length > 0 && (
        <div className={styles.section} data-testid="linked-specs-section">
          <h3 className={styles.sectionTitle}>Linked Specs</h3>
          <ul className={styles.linkedSpecList}>
            {linkedSpecs.map((spec) => (
              <li key={spec._id} className={styles.linkedSpecItem}>
                <Link
                  to={`/projects/${routeProjectId ?? design.projectId}/plan/specs/${spec._id}`}
                >
                  <span className={styles.linkedSpecKey}>
                    {spec.specKey}
                  </span>
                  {spec.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.variationsSection} data-testid="variations-section">
        <h3 className={styles.sectionTitle}>Variations</h3>
        {variations.length === 0 ? (
          <p className={styles.empty}>No variations yet.</p>
        ) : (
          variations.map((variation) => (
            <div key={variation._id} className={styles.variationCard}>
              <div className={styles.variationHeader}>
                <span className={styles.variationSlug}>{variation.slug}</span>
                <span className={styles.variationTitle}>{variation.title}</span>
                <StatusBadge
                  status={toStatusBadgeStatus(variation.status)}
                  label={variationStatusLabel(variation.status)}
                />
              </div>
              <div className={styles.variationEmbed}>
                <iframe
                  title={`${variation.title} wireframe`}
                  src={`${DESIGN_WORKBENCH_BASE_URL}/render/${encodeURIComponent(designSlug)}/${encodeURIComponent(variation.slug)}`}
                  className={styles.variationIframe}
                  loading="lazy"
                />
              </div>
              <a
                href={`${DESIGN_WORKBENCH_BASE_URL}/designs/${encodeURIComponent(designSlug)}/${encodeURIComponent(variation.slug)}`}
                target="_blank"
                rel="noreferrer"
                className={styles.variationLink}
              >
                Open in workbench
              </a>
            </div>
          ))
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Comments</h3>
        <CommentTimeline
          projectId={routeProjectId || design.projectId}
          targetType="design"
          targetId={designId ?? ""}
        />
      </div>
    </div>
  )
}
