import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TimelineQuery } from "@/services/data/queryDefs"
import { StatPanel } from "@/components/ui/stat-panel"
import styles from "./ActionTimeline.module.scss"

interface ActionTimelineProps {
  orchestrationId: string
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function entryClassName(source: string, category: string): string {
  if (source === "action_completion") {
    return category === "failure" ? styles.failure : styles.success
  }
  if (source === "control_action") return styles.request
  return styles.event
}

function badgeClassName(status: string | null): string {
  if (status === "completed") return styles.completed
  if (status === "failed") return styles.failed
  return styles.pending
}

export function ActionTimeline({ orchestrationId }: ActionTimelineProps) {
  const result = useTypedQuery(TimelineQuery, { orchestrationId, limit: 50 })

  const isLoading = result.status !== "success"
  const entries = result.status === "success" ? result.data : []

  return (
    <StatPanel title="Action Timeline">
      {isLoading && (
        <div className="text-[8px] text-muted-foreground animate-pulse">
          Loading timeline...
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="text-[8px] text-muted-foreground">No actions recorded</div>
      )}

      {!isLoading && entries.length > 0 && (
        <div className={styles.timeline} role="log" aria-label="Action timeline">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`${styles.entry} ${entryClassName(entry.source, entry.category)}`}
            >
              <span className={styles.timestamp}>{formatTime(entry.timestamp)}</span>
              <span className={styles.summary}>{entry.summary}</span>
              {entry.status && (
                <span className={`${styles.badge} ${badgeClassName(entry.status)}`}>
                  {entry.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </StatPanel>
  )
}
