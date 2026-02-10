import { useFocusable } from "@/hooks/useFocusable"
import { StatPanel } from "@/components/ui/stat-panel"
import type { OrchestrationEvent } from "@/schemas"

interface ReviewSectionProps {
  reviewEvents: readonly OrchestrationEvent[]
  isLoading: boolean
}

export function ReviewSection({ reviewEvents, isLoading }: ReviewSectionProps) {
  // Register focus section
  useFocusable("rightPanel.review", reviewEvents.length)

  return (
    <StatPanel title="Phase Review">
      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
          Loading review events...
        </div>
      ) : reviewEvents.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
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
            className="w-full px-4 py-2 text-[9px] font-bold uppercase tracking-tight bg-primary/10 border border-primary/20 text-primary rounded-md hover:bg-primary/20 transition-colors"
            onClick={() => {
              // TODO: Handle review approval
            }}
            aria-label="Review and approve phase"
          >
            Review and Approve
          </button>
        </div>
      )}
    </StatPanel>
  )
}
