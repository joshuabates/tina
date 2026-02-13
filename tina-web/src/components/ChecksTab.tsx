import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ReviewCheckListQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import type { ReviewCheck } from "@/schemas"

interface ChecksTabProps {
  reviewId: string
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function CheckRow({ check }: { check: ReviewCheck }) {
  const durationMs = Option.getOrUndefined(check.durationMs)
  const comment = Option.getOrUndefined(check.comment)
  const output = Option.getOrUndefined(check.output)

  return (
    <div data-testid="check-row" className="rounded border border-zinc-800 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium flex-1">{check.name}</span>
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-zinc-800 text-zinc-400">
          {check.kind}
        </span>
        <StatusBadge status={toStatusBadgeStatus(check.status)} />
        {durationMs != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDuration(durationMs)}
          </span>
        )}
      </div>
      {check.status === "failed" && (comment || output) && (
        <div className="space-y-1">
          {comment && (
            <div className="text-sm text-red-400">{comment}</div>
          )}
          {output && (
            <pre className="text-xs text-muted-foreground bg-zinc-900 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function ChecksTab({ reviewId }: ChecksTabProps) {
  const result = useTypedQuery(ReviewCheckListQuery, { reviewId })

  return (
    <div className="space-y-3">
      {matchQueryResult(result, {
        loading: () => (
          <div className="text-muted-foreground text-sm">Loading checks...</div>
        ),
        error: () => (
          <div className="text-red-500 text-sm">Failed to load checks</div>
        ),
        success: (checks) => {
          if (!checks || checks.length === 0) {
            return <div className="text-muted-foreground text-sm">No checks yet</div>
          }

          return (
            <>
              {checks.map((check) => (
                <CheckRow key={check._id} check={check} />
              ))}
            </>
          )
        },
      })}
    </div>
  )
}
