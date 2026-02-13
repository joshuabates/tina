import { useTypedQuery } from "@/hooks/useTypedQuery"
import { BlockingFeedbackSummaryQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import { StatPanel } from "@/components/ui/stat-panel"

interface FeedbackSummarySectionProps {
  orchestrationId: string
}

export function FeedbackSummarySection({ orchestrationId }: FeedbackSummarySectionProps) {
  const result = useTypedQuery(BlockingFeedbackSummaryQuery, { orchestrationId })

  return (
    <StatPanel title="Feedback">
      {matchQueryResult(result, {
        loading: () => (
          <div className="text-[8px] text-muted-foreground animate-pulse">
            Loading feedback...
          </div>
        ),
        error: () => (
          <div className="text-[8px] text-red-500">Failed to load feedback</div>
        ),
        success: (summary) => (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Blocking changes requested:
            </span>
            <span
              className={`text-sm font-bold ${
                summary.openAskForChangeCount > 0
                  ? "text-yellow-400"
                  : "text-muted-foreground"
              }`}
            >
              {summary.openAskForChangeCount}
            </span>
          </div>
        ),
      })}
    </StatPanel>
  )
}
