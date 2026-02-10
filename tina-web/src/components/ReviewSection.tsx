import { useFocusable } from "@/hooks/useFocusable"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { toOrchestrationId } from "@/services/data/id"
import type { OrchestrationDetail } from "@/schemas"

interface ReviewSectionProps {
  detail: OrchestrationDetail
}

export function ReviewSection({ detail }: ReviewSectionProps) {
  // Fetch events for this orchestration
  const eventsResult = useTypedQuery(EventListQuery, {
    orchestrationId: toOrchestrationId(detail._id),
  })

  // Filter for phase_review_* events
  const reviewEvents = eventsResult.status === "success"
    ? eventsResult.data.filter((event) => event.eventType.startsWith("phase_review"))
    : []

  // Register focus section
  useFocusable("rightPanel.review", reviewEvents.length)

  // Handle loading state
  if (eventsResult.status === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading review events...
      </div>
    )
  }

  // Handle empty state
  if (reviewEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No review events yet
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Review</h3>
      </div>

      {/* Review events list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {reviewEvents.map((event) => (
          <div
            key={event._id}
            className="p-3 border border-border rounded-lg space-y-2"
          >
            <div className="text-sm">{event.summary}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(event.recordedAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Action area */}
      <div className="px-4 py-3 border-t border-border">
        <button className="w-full px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
          Review and Approve
        </button>
      </div>
    </div>
  )
}
