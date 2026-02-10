import { Option } from "effect"
import { MonoText } from "@/components/ui/mono-text"
import { StatPanel } from "@/components/ui/stat-panel"
import type { OrchestrationEvent } from "@/schemas"
import styles from "./GitOpsSection.module.scss"

export interface GitOpsSectionProps {
  gitEvents: readonly OrchestrationEvent[]
  isLoading: boolean
}

export function GitOpsSection({ gitEvents, isLoading }: GitOpsSectionProps) {
  if (isLoading) {
    return (
      <StatPanel title="Git Operations">
        <div className={styles.loading}>
          Loading git activity...
        </div>
      </StatPanel>
    )
  }

  return (
    <StatPanel title="Git Operations">
      {gitEvents.length === 0 ? (
        <div className="text-muted-foreground text-sm py-1">
          No git activity yet
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-[7px] font-bold text-muted-foreground uppercase tracking-wide">
            Recent Events
          </div>
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
    </StatPanel>
  )
}
