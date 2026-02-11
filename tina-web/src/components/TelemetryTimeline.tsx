import { useState, useMemo } from "react"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import type { OrchestrationEvent } from "@/schemas"
import styles from "./TelemetryTimeline.module.scss"

interface TelemetryTimelineProps {
  orchestrationId: string
}

interface PhaseGroup {
  phaseLabel: string
  phaseNumber: string | null
  events: OrchestrationEvent[]
}

function groupEventsByPhase(events: readonly OrchestrationEvent[]): PhaseGroup[] {
  const groups = new Map<string, OrchestrationEvent[]>()

  for (const event of events) {
    const phaseNum = Option.getOrNull(event.phaseNumber)
    const key = phaseNum ?? "__orchestration__"

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(event)
  }

  const result: PhaseGroup[] = []

  // Sort phases numerically
  const entries = Array.from(groups.entries())
  entries.sort((a, b) => {
    if (a[0] === "__orchestration__") return -1
    if (b[0] === "__orchestration__") return 1
    return parseInt(a[0], 10) - parseInt(b[0], 10)
  })

  for (const [key, events] of entries) {
    result.push({
      phaseLabel: key === "__orchestration__" ? "Orchestration" : `Phase ${key}`,
      phaseNumber: key === "__orchestration__" ? null : key,
      events,
    })
  }

  return result
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString)
  const hours = date.getUTCHours().toString().padStart(2, "0")
  const minutes = date.getUTCMinutes().toString().padStart(2, "0")
  const seconds = date.getUTCSeconds().toString().padStart(2, "0")
  return `${hours}:${minutes}:${seconds}`
}

function getEventTypeColor(eventType: string): string {
  if (eventType.startsWith("state.")) return styles.eventTypeState
  if (eventType.startsWith("projection.write")) return styles.eventTypeWrite
  if (eventType.startsWith("projection.skip")) return styles.eventTypeSkip
  if (eventType.startsWith("query.")) return styles.eventTypeQuery
  if (eventType.startsWith("consistency.")) return styles.eventTypeConsistency
  if (eventType.startsWith("operator.")) return styles.eventTypeOperator
  return styles.eventTypeDefault
}

interface PhaseEventGroupProps {
  group: PhaseGroup
  isExpanded: boolean
  onToggle: () => void
}

function PhaseEventGroup({ group, isExpanded, onToggle }: PhaseEventGroupProps) {
  return (
    <div className={styles.phaseGroup}>
      <button
        className={styles.phaseHeader}
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span className={styles.phaseLabel}>{group.phaseLabel}</span>
        <span className={styles.eventCount}>({group.events.length})</span>
        <span className={styles.chevron}>{isExpanded ? "▼" : "▶"}</span>
      </button>
      {isExpanded && (
        <div className={styles.eventList}>
          {group.events.map((event) => (
            <div
              key={event._id}
              className={styles.event}
              data-event-type={event.eventType}
            >
              <div className={styles.eventHeader}>
                <span
                  className={`${styles.eventType} ${getEventTypeColor(event.eventType)}`}
                >
                  {event.eventType}
                </span>
                <span className={styles.eventSource}>{event.source}</span>
                <span
                  className={styles.eventTimestamp}
                  data-testid="event-timestamp"
                >
                  {formatTimestamp(event.recordedAt)}
                </span>
              </div>
              <div className={styles.eventSummary}>{event.summary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TelemetryTimeline({ orchestrationId }: TelemetryTimelineProps) {
  const result = useTypedQuery(EventListQuery, { orchestrationId })
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())

  const phaseGroups = useMemo(() => {
    if (result.status !== "success") return []
    return groupEventsByPhase(result.data)
  }, [result])

  // Initialize all phases as expanded on first render
  const [initialized, setInitialized] = useState(false)
  if (!initialized && phaseGroups.length > 0) {
    setExpandedPhases(new Set(phaseGroups.map((g) => g.phaseLabel)))
    setInitialized(true)
  }

  const togglePhase = (phaseLabel: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(phaseLabel)) {
        next.delete(phaseLabel)
      } else {
        next.add(phaseLabel)
      }
      return next
    })
  }

  return matchQueryResult(result, {
    loading: () => (
      <div className={styles.timeline}>
        <div className={styles.emptyState}>Loading telemetry events...</div>
      </div>
    ),
    error: (error) => (
      <div className={styles.timeline}>
        <div className={styles.errorState}>
          Error loading telemetry: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </div>
    ),
    success: (events) => {
      if (events.length === 0) {
        return (
          <div className={styles.timeline}>
            <div className={styles.emptyState}>No telemetry events yet</div>
          </div>
        )
      }

      return (
        <div className={styles.timeline}>
          {phaseGroups.map((group) => (
            <PhaseEventGroup
              key={group.phaseLabel}
              group={group}
              isExpanded={expandedPhases.has(group.phaseLabel)}
              onToggle={() => togglePhase(group.phaseLabel)}
            />
          ))}
        </div>
      )
    },
  })
}
