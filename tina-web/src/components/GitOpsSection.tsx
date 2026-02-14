import { useEffect, useMemo, useRef, useState } from "react"
import { Option } from "effect"
import { MonoText } from "@/components/ui/mono-text"
import { StatPanel } from "@/components/ui/stat-panel"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useCommitDetails } from "@/hooks/useDaemonQuery"
import { useIndexedAction } from "@/hooks/useIndexedAction"
import { useRovingSection } from "@/hooks/useRovingSection"
import { useActionRegistration } from "@/hooks/useActionRegistration"
import {
  CommitListQuery,
  OrchestrationDetailQuery,
} from "@/services/data/queryDefs"
import type { OrchestrationEvent } from "@/schemas"
import { optionNullableText } from "@/lib/option-display"
import { cn } from "@/lib/utils"
import { CommitQuicklook, type HydratedCommit } from "./CommitQuicklook"
import styles from "./GitOpsSection.module.scss"

export interface GitOpsSectionProps {
  orchestrationId: string
  gitEvents: readonly OrchestrationEvent[]
  isLoading: boolean
}

interface GitItem {
  event: OrchestrationEvent
  commit?: HydratedCommit
}

function formatRelativeTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function GitOpsSection({
  orchestrationId,
  gitEvents,
  isLoading,
}: GitOpsSectionProps) {
  const [quicklookCommitId, setQuicklookCommitId] = useState<string | null>(null)
  const [quicklookTracksKeyboardSelection, setQuicklookTracksKeyboardSelection] = useState(true)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const focusedElementRef = useRef<HTMLElement | null>(null)

  const commitsResult = useTypedQuery(CommitListQuery, { orchestrationId })
  const orchestrationResult = useTypedQuery(OrchestrationDetailQuery, { orchestrationId })
  const worktreePath =
    orchestrationResult.status === "success" && orchestrationResult.data
      ? Option.getOrElse(orchestrationResult.data.worktreePath, () => "")
      : ""

  const commitShas =
    commitsResult.status === "success" ? commitsResult.data.map((commit) => commit.sha) : []
  const detailsResult = useCommitDetails(worktreePath, commitShas)

  const detailsBySha = useMemo(
    () =>
      new Map(
        (detailsResult.data?.commits ?? []).map((detail) => [detail.sha, detail] as const),
      ),
    [detailsResult.data],
  )

  const commitsById = useMemo(() => {
    if (commitsResult.status !== "success") {
      return new Map<string, HydratedCommit>()
    }

    return new Map(
      commitsResult.data.map((commit) => [
        commit._id,
        {
          ...commit,
          detail: detailsBySha.get(commit.sha),
        },
      ] as const),
    )
  }, [commitsResult, detailsBySha])

  const gitItems: GitItem[] = useMemo(
    () =>
      gitEvents.map((event) => ({
        event,
        commit: event.eventType === "git_commit" ? commitsById.get(event._id) : undefined,
      })),
    [gitEvents, commitsById],
  )

  const { activeIndex, activeDescendantId, getItemProps } = useRovingSection({
    sectionId: "rightPanel.git",
    itemCount: gitItems.length,
    getItemDomId: (index) => {
      const item = gitItems[index]
      return item ? `git-event-${item.event._id}` : undefined
    },
  })

  const toggleQuicklookForIndex = (index: number, openedFromHover: boolean) => {
    const item = gitItems[index]
    if (!item?.commit) return

    const commitId = item.commit._id
    if (quicklookCommitId === commitId) {
      setQuicklookTracksKeyboardSelection(true)
      setQuicklookCommitId(null)
      return
    }

    focusedElementRef.current = document.activeElement as HTMLElement
    setQuicklookTracksKeyboardSelection(!openedFromHover)
    setQuicklookCommitId(commitId)
  }

  useIndexedAction({
    id: "right-panel-git-quicklook",
    label: "View Commit Details",
    key: " ",
    when: "rightPanel.git",
    items: gitItems,
    activeIndex,
    resolveIndex: () => hoveredIndex,
    execute: (_, index) => {
      toggleQuicklookForIndex(index, hoveredIndex !== null)
    },
  })

  useIndexedAction({
    id: "right-panel-git-quicklook-enter",
    label: "Open Commit",
    key: "Enter",
    when: "rightPanel.git",
    items: gitItems,
    activeIndex,
    resolveIndex: () => hoveredIndex,
    execute: (_, index) => {
      toggleQuicklookForIndex(index, hoveredIndex !== null)
    },
  })

  // Hover fallback enables quicklook from right panel when focus is elsewhere.
  useActionRegistration({
    id: "right-panel-git-quicklook-hover",
    label: "View Hovered Commit Details",
    key: hoveredIndex === null ? undefined : " ",
    execute: () => {
      if (hoveredIndex === null) return
      toggleQuicklookForIndex(hoveredIndex, true)
    },
  })

  useEffect(() => {
    if (hoveredIndex === null) return
    if (hoveredIndex >= 0 && hoveredIndex < gitItems.length) return
    setHoveredIndex(null)
  }, [hoveredIndex, gitItems.length])

  useEffect(() => {
    if (quicklookCommitId === null) return
    if (!quicklookTracksKeyboardSelection) return

    const activeItem = gitItems[activeIndex]
    if (!activeItem?.commit) return
    if (activeItem.commit._id === quicklookCommitId) return

    setQuicklookCommitId(activeItem.commit._id)
  }, [activeIndex, gitItems, quicklookCommitId, quicklookTracksKeyboardSelection])

  const quicklookCommit = quicklookCommitId ? commitsById.get(quicklookCommitId) : undefined

  const handleQuicklookClose = () => {
    setQuicklookTracksKeyboardSelection(true)
    setQuicklookCommitId(null)
    if (focusedElementRef.current) {
      focusedElementRef.current.focus()
      focusedElementRef.current = null
    }
  }

  return (
    <>
      <StatPanel title="Git Operations">
        {isLoading ? (
          <div className={styles.loading}>Loading git activity...</div>
        ) : gitItems.length === 0 ? (
          <div className="flex justify-start py-1 text-muted-foreground text-sm">
            No git activity yet
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-[7px] font-bold text-muted-foreground uppercase tracking-wide">
              Recent Events
            </div>

            <div
              role="listbox"
              aria-label="Git operations"
              aria-activedescendant={activeDescendantId}
              className="space-y-3"
            >
              {gitItems.map((item, index) => {
                const detail = optionNullableText(item.event.detail, (value) => value)
                const rovingProps = getItemProps(index, `git-event-${item.event._id}`)
                const metadataTime = item.commit?.recordedAt ?? item.event.recordedAt
                const metadata = item.commit?.detail
                  ? `${item.commit.detail.author} · ${formatRelativeTime(item.commit.detail.timestamp)} · +${item.commit.detail.insertions} -${item.commit.detail.deletions}`
                  : `Recorded ${formatRelativeTime(metadataTime)}`

                const itemClassName = cn(
                  "w-full rounded-lg border border-border/70 bg-background/50 p-3 text-left transition-colors",
                  "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  "data-[focused=true]:ring-2 data-[focused=true]:ring-primary/40 data-[focused=true]:bg-primary/5",
                )

                const itemContent = (
                  <>
                    <div className="text-sm">{item.event.summary}</div>
                    {detail && (
                      <MonoText className="text-xs text-muted-foreground">{detail}</MonoText>
                    )}
                    <div className="text-xs text-muted-foreground">{metadata}</div>
                  </>
                )

                if (item.commit) {
                  return (
                    <button
                      key={item.event._id}
                      type="button"
                      onClick={() => toggleQuicklookForIndex(index, false)}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => {
                        setHoveredIndex((current) => (current === index ? null : current))
                      }}
                      className={itemClassName}
                      {...rovingProps}
                    >
                      {itemContent}
                    </button>
                  )
                }

                return (
                  <div
                    key={item.event._id}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => {
                      setHoveredIndex((current) => (current === index ? null : current))
                    }}
                    className={itemClassName}
                    {...rovingProps}
                  >
                    {itemContent}
                  </div>
                )
              })}
            </div>

            {detailsResult.isError && (
              <div className="text-muted-foreground text-xs">
                Daemon details unavailable. Showing commit index only.
              </div>
            )}
          </div>
        )}
      </StatPanel>

      {quicklookCommit && (
        <CommitQuicklook commit={quicklookCommit} onClose={handleQuicklookClose} />
      )}
    </>
  )
}
