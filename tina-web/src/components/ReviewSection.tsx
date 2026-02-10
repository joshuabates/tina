import { useFocusable } from "@/hooks/useFocusable"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { toOrchestrationId } from "@/services/data/id"
import { PanelSection } from "@/components/Panel"
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

  if (eventsResult.status === "error") {
    throw eventsResult.error
  }

  return (
    <PanelSection label="Review">
      {eventsResult.status === "loading" ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          Loading review events...
        </div>
      ) : reviewEvents.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
          No review events yet
        </div>
      ) : (
        <div className="space-y-3">
          {/* Review events */}
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

          {/* Action button */}
          <button
            className="w-full px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            onClick={() => {
              // TODO: Handle review approval
            }}
            aria-label="Review and approve phase"
          >
            Review and Approve
          </button>
        </div>
      )}
    </PanelSection>
  )
}
