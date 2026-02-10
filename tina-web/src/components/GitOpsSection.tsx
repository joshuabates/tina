import { Option } from "effect"
import { MonoText } from "@/components/ui/mono-text"
import { PanelSection } from "@/components/Panel"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { toOrchestrationId } from "@/services/data/id"
import type { OrchestrationDetail } from "@/schemas"

export interface GitOpsSectionProps {
  detail: OrchestrationDetail
}

export function GitOpsSection({ detail }: GitOpsSectionProps) {
  // Fetch events for this orchestration
  const eventsResult = useTypedQuery(EventListQuery, {
    orchestrationId: toOrchestrationId(detail._id),
  })

  // Loading state
  if (eventsResult.status === "loading") {
    return (
      <PanelSection label="Git">
        <div className="text-muted-foreground text-sm">
          Loading git activity...
        </div>
      </PanelSection>
    )
  }

  const events = eventsResult.status === "success" ? eventsResult.data : []

  // Filter git events (events with eventType starting with "git_")
  const gitEvents = events.filter((event) => event.eventType.startsWith("git_"))

  return (
    <PanelSection label="Git">
      {gitEvents.length === 0 ? (
        <div className="text-muted-foreground text-sm">
          No git activity yet
        </div>
      ) : (
        <div className="space-y-4">
          {gitEvents.map((event) => (
            <div key={event._id} className="space-y-1">
              <div className="text-sm">{event.summary}</div>
              {Option.match(event.detail, {
                onNone: () => null,
                onSome: (detail) => (
                  <MonoText className="text-xs text-muted-foreground">
                    {detail}
                  </MonoText>
                ),
              })}
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  )
}
