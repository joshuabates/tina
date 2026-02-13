import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import {
  ReviewDetailQuery,
  ReviewGateListQuery,
} from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import { DataErrorBoundary } from "./DataErrorBoundary"
import { CommitListPanel } from "./CommitListPanel"
import { ConversationTab } from "./ConversationTab"
import { ChecksTab } from "./ChecksTab"
import type { ReviewGate } from "@/schemas"
import styles from "./ReviewDetailPage.module.scss"

type TabId = "conversation" | "checks" | "changes"

const TABS: { id: TabId; label: string }[] = [
  { id: "conversation", label: "Commits + Conversation" },
  { id: "checks", label: "Checks" },
  { id: "changes", label: "Changes" },
]

const REVIEW_STATE_LABELS: Record<string, string> = {
  open: "Open",
  changes_requested: "Changes Requested",
  approved: "Approved",
  superseded: "Superseded",
}

function GateIndicator({ gate }: { gate: ReviewGate }) {
  const statusClass = styles[gate.status] ?? ""
  return (
    <span className={`${styles.gateIndicator} ${statusClass}`}>
      {gate.gateId}: {gate.status}
    </span>
  )
}

function ReviewDetailContent() {
  const { orchestrationId, reviewId } = useParams<{
    orchestrationId: string
    reviewId: string
  }>()
  const [activeTab, setActiveTab] = useState<TabId>("conversation")

  const reviewResult = useTypedQuery(ReviewDetailQuery, {
    reviewId: reviewId ?? "",
  })
  const gatesResult = useTypedQuery(ReviewGateListQuery, {
    orchestrationId: orchestrationId ?? "",
  })

  if (isAnyQueryLoading(reviewResult)) {
    return (
      <div data-testid="review-detail-page" className={styles.reviewPage}>
        <div data-testid="review-loading" className={styles.loading}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(reviewResult, gatesResult)
  if (queryError) {
    throw queryError
  }

  if (reviewResult.status !== "success") return null

  const review = reviewResult.data
  if (!review) {
    return (
      <div data-testid="review-detail-page" className={styles.reviewPage}>
        <div className={styles.notFound}>Review not found</div>
      </div>
    )
  }

  const gates =
    gatesResult.status === "success" ? (gatesResult.data ?? []) : []

  const phaseNumber = Option.getOrUndefined(review.phaseNumber)
  const phaseLabel = phaseNumber
    ? `Phase ${phaseNumber}`
    : "Orchestration Review"

  return (
    <div data-testid="review-detail-page" className={styles.reviewPage}>
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link to={`/?orch=${orchestrationId}`}>Orchestration</Link>
          {" / "}
          <span>{phaseLabel}</span>
        </div>
        <h2 className={styles.title}>
          {phaseLabel} Review{" "}
          <StatusBadge
            status={toStatusBadgeStatus(review.state)}
            label={REVIEW_STATE_LABELS[review.state] ?? review.state}
          />
        </h2>
        <div className={styles.meta}>
          <span>Reviewer: {review.reviewerAgent}</span>
          <span>Started: {new Date(review.startedAt).toLocaleString()}</span>
        </div>
        {gates.length > 0 && (
          <div className={styles.gates} data-testid="gate-indicators">
            {gates.map((gate) => (
              <GateIndicator key={gate.gateId} gate={gate} />
            ))}
          </div>
        )}
      </div>

      <div className={styles.tabBar} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabContent} role="tabpanel">
        {activeTab === "conversation" && (
          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-semibold mb-2">Commits</h3>
              <CommitListPanel
                orchestrationId={orchestrationId ?? ""}
                phaseNumber={phaseNumber}
              />
            </section>
            <section>
              <h3 className="text-sm font-semibold mb-2">Conversation</h3>
              <ConversationTab
                reviewId={reviewId ?? ""}
                orchestrationId={orchestrationId ?? ""}
              />
            </section>
          </div>
        )}
        {activeTab === "checks" && (
          <ChecksTab reviewId={reviewId ?? ""} />
        )}
        {activeTab === "changes" && (
          <div className={styles.placeholder}>
            Changes tab — coming in Phase 6
          </div>
        )}
      </div>
    </div>
  )
}

export function ReviewDetailPage() {
  return (
    <DataErrorBoundary panelName="review">
      <ReviewDetailContent />
    </DataErrorBoundary>
  )
}
