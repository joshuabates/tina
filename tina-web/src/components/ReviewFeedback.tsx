import React from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import type { ReviewThread } from "@/schemas"

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

export function ReviewThreadCard({ thread }: { thread: ReviewThread }) {
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

interface ReviewFeedbackComposerProps {
  reviewId: string | null
  orchestrationId: string
  commitSha?: string
  emptyMessage?: string
  summaryLabel?: string
  bodyLabel?: string
  summaryPlaceholder?: string
  bodyPlaceholder?: string
  submitLabel?: string
  successMessage?: string
}

interface FeedbackState {
  kind: "success" | "error"
  message: string
}

export function ReviewFeedbackComposer({
  reviewId,
  orchestrationId,
  commitSha = "",
  emptyMessage = "No review available for feedback yet",
  summaryLabel = "Comment summary",
  bodyLabel = "Comment body",
  summaryPlaceholder = "Summary",
  bodyPlaceholder = "Details (optional)",
  submitLabel = "Comment",
  successMessage = "Feedback submitted",
}: ReviewFeedbackComposerProps) {
  const [summary, setSummary] = React.useState("")
  const [body, setBody] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [feedback, setFeedback] = React.useState<FeedbackState | null>(null)
  const createThread = useMutation(api.reviewThreads.createThread)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const summaryValue = summary.trim()
    if (!reviewId || !summaryValue) return

    setSubmitting(true)
    setFeedback(null)
    try {
      await createThread({
        reviewId: reviewId as Id<"reviews">,
        orchestrationId: orchestrationId as Id<"orchestrations">,
        summary: summaryValue,
        body: body.trim(),
        source: "human",
        filePath: "",
        line: 0,
        commitSha,
        severity: "p2",
        author: "human",
        gateImpact: "review",
      })
      setSummary("")
      setBody("")
      setFeedback({ kind: "success", message: successMessage })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add comment"
      setFeedback({ kind: "error", message })
    } finally {
      setSubmitting(false)
    }
  }

  if (!reviewId) {
    return (
      <div className="rounded border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-b border-zinc-800 pb-4 mb-4">
      <input
        aria-label={summaryLabel}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder={summaryPlaceholder}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      />
      <textarea
        aria-label={bodyLabel}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={bodyPlaceholder}
        rows={3}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
      />
      {feedback && (
        <div
          className={
            feedback.kind === "error" ? "text-red-500 text-sm" : "text-green-500 text-sm"
          }
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : submitLabel}
      </button>
    </form>
  )
}
