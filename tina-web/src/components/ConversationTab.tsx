import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ReviewThreadListQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import { ReviewFeedbackComposer, ReviewThreadCard } from "@/components/ReviewFeedback"

interface ConversationTabProps {
  reviewId: string
  orchestrationId: string
}

export function ConversationTab({ reviewId, orchestrationId }: ConversationTabProps) {
  const result = useTypedQuery(ReviewThreadListQuery, { reviewId })

  return (
    <div className="space-y-4">
      <ReviewFeedbackComposer
        reviewId={reviewId}
        orchestrationId={orchestrationId}
      />
      {matchQueryResult(result, {
        loading: () => (
          <div className="text-muted-foreground text-sm">Loading comments...</div>
        ),
        error: () => (
          <div className="text-red-500 text-sm">Failed to load comments</div>
        ),
        success: (threads) => {
          if (!threads || threads.length === 0) {
            return <div className="text-muted-foreground text-sm">No comments yet</div>
          }

          return (
            <div className="space-y-3">
              {threads.map((thread) => (
                <ReviewThreadCard key={thread._id} thread={thread} />
              ))}
            </div>
          )
        },
      })}
    </div>
  )
}
