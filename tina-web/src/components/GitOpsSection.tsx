import { Option } from "effect"
import { MonoText } from "@/components/ui/mono-text"
import type { OrchestrationEvent } from "@/schemas"

export interface GitOpsSectionProps {
  events: OrchestrationEvent[]
}

export function GitOpsSection({ events }: GitOpsSectionProps) {
  // Filter git events (events with eventType starting with "git_")
  const gitEvents = events.filter((event) => event.eventType.startsWith("git_"))

  if (gitEvents.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        No git activity yet
      </div>
    )
  }

  return (
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
  )
}
