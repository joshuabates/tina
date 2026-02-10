import { useFocusable } from "@/hooks/useFocusable"
import { EventSection } from "@/components/EventSection"
import type { OrchestrationEvent } from "@/schemas"

interface ReviewSectionProps {
  reviewEvents: readonly OrchestrationEvent[]
  isLoading: boolean
}

export function ReviewSection({ reviewEvents, isLoading }: ReviewSectionProps) {
  // Register focus section
  useFocusable("rightPanel.review", reviewEvents.length)

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
        <button
          className="w-full px-4 py-2 text-[9px] font-bold uppercase tracking-tight bg-primary/10 border border-primary/20 text-primary rounded-md hover:bg-primary/20 transition-colors"
          onClick={() => {
            // TODO: Handle review approval
          }}
          aria-label="Review and approve phase"
        >
          Review and Approve
        </button>
      )}
    />
  )
}
