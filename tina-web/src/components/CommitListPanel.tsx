import React from "react"
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { useCommitDetails } from "@/hooks/useDaemonQuery"
import { CommitListQuery, OrchestrationDetailQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import type { Commit } from "@/schemas"
import { CommitQuicklook, type HydratedCommit } from "./CommitQuicklook"

interface CommitListPanelProps {
  orchestrationId: string
  phaseNumber?: string
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

function commitShortSha(commit: Commit): string {
  return commit.shortSha ?? commit.sha.slice(0, 7)
}

export function CommitListPanel({ orchestrationId, phaseNumber }: CommitListPanelProps) {
  const [selectedCommit, setSelectedCommit] = React.useState<HydratedCommit | null>(null)

  const commitsResult = useTypedQuery(CommitListQuery, {
    orchestrationId,
    phaseNumber,
  })

  const orchestrationResult = useTypedQuery(OrchestrationDetailQuery, { orchestrationId })
  const worktreePath =
    orchestrationResult.status === "success" && orchestrationResult.data
      ? Option.getOrElse(orchestrationResult.data.worktreePath, () => "")
      : ""

  const commitShas =
    commitsResult.status === "success" ? commitsResult.data.map((commit) => commit.sha) : []
  const detailsResult = useCommitDetails(worktreePath, commitShas)

  const detailsBySha = React.useMemo(
    () =>
      new Map(
        (detailsResult.data?.commits ?? []).map((detail) => [detail.sha, detail] as const),
      ),
    [detailsResult.data],
  )

  return matchQueryResult(commitsResult, {
    loading: () => (
      <div className="text-muted-foreground text-sm">Loading commits...</div>
    ),
    error: () => (
      <div className="text-red-500 text-sm">Failed to load commits</div>
    ),
    success: (commits) => {
      if (!commits || commits.length === 0) {
        return <div className="text-muted-foreground text-sm">No commits yet</div>
      }

      const hydratedCommits: HydratedCommit[] = commits.map((commit) => ({
        ...commit,
        detail: detailsBySha.get(commit.sha),
      }))

      const groupedCommits = phaseNumber
        ? { [phaseNumber]: hydratedCommits }
        : hydratedCommits.reduce((acc, commit) => {
            const phase = commit.phaseNumber
            if (!acc[phase]) acc[phase] = []
            acc[phase].push(commit)
            return acc
          }, {} as Record<string, HydratedCommit[]>)

      return (
        <>
          {detailsResult.isError && (
            <div className="text-muted-foreground text-xs mb-2">
              Daemon details unavailable. Showing commit index only.
            </div>
          )}
          <div className="space-y-4">
            {Object.entries(groupedCommits).map(([phase, phaseCommits]) => (
              <div key={phase}>
                {!phaseNumber && (
                  <h4 className="text-sm font-semibold mb-2">Phase {phase}</h4>
                )}
                <div className="space-y-1">
                  {phaseCommits.map((commit) => (
                    <button
                      key={commit._id}
                      onClick={() => setSelectedCommit(commit)}
                      className="w-full text-left text-sm hover:bg-muted p-2 rounded"
                    >
                      <div className="flex items-start gap-2">
                        <code className="text-primary font-mono">{commitShortSha(commit)}</code>
                        <span className="flex-1">
                          {commit.detail?.subject ?? "Commit message unavailable (index only)"}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-xs mt-1">
                        {commit.detail ? (
                          <>
                            {commit.detail.author} ·{" "}
                            {formatRelativeTime(commit.detail.timestamp)} ·{" "}
                            <span className="text-green-400">+{commit.detail.insertions}</span>{" "}
                            <span className="text-red-400">-{commit.detail.deletions}</span>
                          </>
                        ) : (
                          <>Recorded {formatRelativeTime(commit.recordedAt)} · metadata unavailable</>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selectedCommit && (
            <CommitQuicklook
              commit={selectedCommit}
              onClose={() => setSelectedCommit(null)}
            />
          )}
        </>
      )
    },
  })
}
