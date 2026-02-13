import React from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ReviewThreadListQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import type { ReviewThread } from "@/schemas"

interface ConversationTabProps {
  reviewId: string
  orchestrationId: string
}

const severityStyles: Record<string, string> = {
  p0: "bg-red-900/30 text-red-400",
  p1: "bg-yellow-900/30 text-yellow-400",
  p2: "bg-zinc-800 text-zinc-400",
}

function SeverityBadge({ severity }: { severity: string }) {
  const style = severityStyles[severity] ?? severityStyles.p2
  return (
    <span
      data-testid="severity-badge"
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${style}`}
    >
      {severity}
    </span>
  )
}

function ThreadCard({ thread }: { thread: ReviewThread }) {
  const initials = thread.author
    .split(/[-\s]/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <div className="rounded border border-zinc-800 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{thread.author}</span>
            <SeverityBadge severity={thread.severity} />
            <span className="text-xs text-muted-foreground">{thread.source}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(thread.createdAt).toLocaleString()}
            </span>
          </div>
          {thread.filePath && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {thread.filePath}:{thread.line}
            </div>
          )}
        </div>
        {thread.status === "resolved" && (
          <span className="text-xs text-green-400">Resolved</span>
        )}
      </div>
      <div className="text-sm font-medium">{thread.summary}</div>
      <div className="text-sm text-muted-foreground">{thread.body}</div>
    </div>
  )
}

function CommentComposer({
  reviewId,
  orchestrationId,
}: {
  reviewId: string
  orchestrationId: string
}) {
  const [summary, setSummary] = React.useState("")
  const [body, setBody] = React.useState("")
  const createThread = useMutation(api.reviewThreads.createThread)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!summary.trim()) return

    await createThread({
      reviewId: reviewId as Id<"reviews">,
      orchestrationId: orchestrationId as Id<"orchestrations">,
      summary,
      body,
      source: "human",
      filePath: "",
      line: 0,
      commitSha: "",
      severity: "p2",
      author: "human",
      gateImpact: "review",
    })

    setSummary("")
    setBody("")
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b border-zinc-800 pb-4 mb-4">
      <input
        aria-label="Comment summary"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Summary"
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      />
      <textarea
        aria-label="Comment body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Details (optional)"
        rows={3}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Comment
      </button>
    </form>
  )
}

export function ConversationTab({ reviewId, orchestrationId }: ConversationTabProps) {
  const result = useTypedQuery(ReviewThreadListQuery, { reviewId })

  return (
    <div className="space-y-4">
      <CommentComposer reviewId={reviewId} orchestrationId={orchestrationId} />
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
                <ThreadCard key={thread._id} thread={thread} />
              ))}
            </div>
          )
        },
      })}
    </div>
  )
}
