import { Link } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useFocusable } from "@/hooks/useFocusable"
import { ReviewListQuery } from "@/services/data/queryDefs"
import { EventSection } from "@/components/EventSection"
import type { OrchestrationEvent } from "@/schemas"

interface ReviewSectionProps {
  orchestrationId: string
  reviewEvents: readonly OrchestrationEvent[]
  isLoading: boolean
}

export function ReviewSection({
  orchestrationId,
  reviewEvents,
  isLoading,
}: ReviewSectionProps) {
  // Register focus section
  useFocusable("rightPanel.review", reviewEvents.length)
  const reviewsResult = useTypedQuery(ReviewListQuery, { orchestrationId })

  const latestReviewId =
    reviewsResult.status === "success" ? reviewsResult.data[0]?._id : undefined

  return (
    <EventSection
      title="Phase Review"
      isLoading={isLoading}
      loadingText="Loading review events..."
      emptyText="No review events yet"
      items={reviewEvents}
      getItemKey={(event) => event._id}
      renderItem={(event) => (
        <div className="p-3 border border-border rounded-lg space-y-2">
          <div className="text-sm">{event.summary}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(event.recordedAt).toLocaleString()}
          </div>
        </div>
      )}
      footer={(
        latestReviewId
          ? (
            <Link
              className="w-full px-4 py-2 text-[9px] font-bold uppercase tracking-tight bg-primary/10 border border-primary/20 text-primary rounded-md hover:bg-primary/20 transition-colors text-center"
              to={`orchestrations/${orchestrationId}/reviews/${latestReviewId}`}
              aria-label="Review and approve phase"
            >
              Review and Approve
            </Link>
            )
          : (
            <button
              className="w-full px-4 py-2 text-[9px] font-bold uppercase tracking-tight bg-primary/10 border border-primary/20 text-primary rounded-md opacity-60 cursor-not-allowed"
              type="button"
              aria-label="Review and approve phase"
              disabled
            >
              Review and Approve
            </button>
            )
      )}
    />
  )
}
