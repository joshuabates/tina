import { MonoText } from "@/components/ui/mono-text"
import { EventSection } from "@/components/EventSection"
import type { OrchestrationEvent } from "@/schemas"
import { optionNullableText } from "@/lib/option-display"
import styles from "./GitOpsSection.module.scss"

export interface GitOpsSectionProps {
  gitEvents: readonly OrchestrationEvent[]
  isLoading: boolean
}

export function GitOpsSection({ gitEvents, isLoading }: GitOpsSectionProps) {
  return (
    <EventSection
      title="Git Operations"
      isLoading={isLoading}
      loadingText="Loading git activity..."
      emptyText="No git activity yet"
      items={gitEvents}
      getItemKey={(event) => event._id}
      loadingClassName={styles.loading}
      emptyClassName="justify-start py-1 text-muted-foreground text-sm"
      listClassName="space-y-4"
      header={
        <div className="text-[7px] font-bold text-muted-foreground uppercase tracking-wide">
          Recent Events
        </div>
      }
      renderItem={(event) => {
        const detail = optionNullableText(event.detail, (value) => value)

        return (
          <div className="space-y-1">
            <div className="text-sm">{event.summary}</div>
            {detail && (
              <MonoText className="text-xs text-muted-foreground">
                {detail}
              </MonoText>
            )}
          </div>
        )
      }}
    />
  )
}
