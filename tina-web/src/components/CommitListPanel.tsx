import React from "react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { CommitListQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import type { Commit } from "@/schemas"
import { CommitQuicklook } from "./CommitQuicklook"

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

export function CommitListPanel({ orchestrationId, phaseNumber }: CommitListPanelProps) {
  const [selectedCommit, setSelectedCommit] = React.useState<Commit | null>(null)

  const result = useTypedQuery(CommitListQuery, {
    orchestrationId,
    phaseNumber,
  })

  return matchQueryResult(result, {
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

      // Group by phase if showing all commits
      const groupedCommits = phaseNumber
        ? { [phaseNumber]: commits }
        : commits.reduce((acc, commit) => {
            const phase = commit.phaseNumber
            if (!acc[phase]) acc[phase] = []
            acc[phase].push(commit)
            return acc
          }, {} as Record<string, Commit[]>)

      return (
        <>
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
                        <code className="text-primary font-mono">{commit.shortSha}</code>
                        <span className="flex-1">{commit.subject}</span>
                      </div>
                      <div className="text-muted-foreground text-xs mt-1">
                        {commit.author} · {formatRelativeTime(commit.timestamp)} ·{" "}
                        <span className="text-green-400">+{commit.insertions}</span>{" "}
                        <span className="text-red-400">-{commit.deletions}</span>
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
