import { useState } from "react"
import { Option } from "effect"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { FeedbackEntryByTargetQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { formatRelativeTimeShort } from "@/lib/time"
import { api } from "@convex/_generated/api"
import type { FeedbackEntry } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"

interface FeedbackSectionProps {
  orchestrationId: string
  targetType: "task" | "commit"
  targetRef: string
}

function entryTypeLabel(entryType: string): string {
  switch (entryType) {
    case "ask_for_change": return "ask_for_change"
    case "suggestion": return "suggestion"
    default: return "comment"
  }
}

function statusColor(status: string): string {
  return status === "resolved"
    ? "text-green-400"
    : "text-muted-foreground"
}

function FeedbackEntryItem({
  entry,
  onResolve,
  onReopen,
}: {
  entry: FeedbackEntry
  onResolve: (entryId: string) => void
  onReopen: (entryId: string) => void
}) {
  const isResolved = entry.status === "resolved"
  const resolvedBy = Option.match(entry.resolvedBy, {
    onNone: () => null,
    onSome: (v) => v,
  })

  return (
    <li className="border border-border rounded p-2 space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">{entry.authorName}</span>
        <span className="text-muted-foreground">{entry.authorType}</span>
        <span className="px-1 py-0.5 rounded bg-muted text-[10px]">
          {entryTypeLabel(entry.entryType)}
        </span>
        <span className={statusColor(entry.status)}>{entry.status}</span>
        <span className="text-muted-foreground ml-auto">
          {formatRelativeTimeShort(entry.createdAt)}
        </span>
      </div>
      <div className="text-sm">{entry.body}</div>
      <div className="flex items-center gap-2">
        {isResolved ? (
          <>
            {resolvedBy && (
              <span className="text-xs text-muted-foreground">
                Resolved by {resolvedBy}
              </span>
            )}
            <button
              type="button"
              className="text-xs text-blue-400 hover:text-blue-300"
              onClick={() => onReopen(entry._id)}
              aria-label="Reopen"
            >
              Reopen
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-xs text-green-400 hover:text-green-300"
            onClick={() => onResolve(entry._id)}
            aria-label="Resolve"
          >
            Resolve
          </button>
        )}
      </div>
    </li>
  )
}

type EntryType = "comment" | "suggestion" | "ask_for_change"

function AddFeedbackForm({
  orchestrationId,
  targetType,
  targetRef,
}: FeedbackSectionProps) {
  const [authorName, setAuthorName] = useState("")
  const [body, setBody] = useState("")
  const [entryType, setEntryType] = useState<EntryType>("comment")
  const [authorType, setAuthorType] = useState<"human" | "agent">("human")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const createEntry = useMutation(api.feedbackEntries.createFeedbackEntry)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!authorName.trim() || !body.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      await createEntry({
        orchestrationId: orchestrationId as Id<"orchestrations">,
        targetType,
        ...(targetType === "task"
          ? { targetTaskId: targetRef }
          : { targetCommitSha: targetRef }),
        entryType,
        body: body.trim(),
        authorType,
        authorName: authorName.trim(),
      })
      setBody("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add feedback")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-2 pt-2 border-t border-border" onSubmit={handleSubmit}>
      <div className="flex items-center gap-2">
        <label htmlFor="feedback-author" className="sr-only">
          Author name
        </label>
        <input
          id="feedback-author"
          className="flex-1 bg-input border border-border rounded px-2 py-1 text-sm"
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Author name"
        />
        <div className="flex gap-1">
          <button
            type="button"
            className="text-xs px-1.5 py-0.5 rounded border border-border"
            data-active={authorType === "human"}
            onClick={() => setAuthorType("human")}
          >
            human
          </button>
          <button
            type="button"
            className="text-xs px-1.5 py-0.5 rounded border border-border"
            data-active={authorType === "agent"}
            onClick={() => setAuthorType("agent")}
          >
            agent
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="feedback-entry-type" className="sr-only">
          Entry type
        </label>
        <select
          id="feedback-entry-type"
          role="combobox"
          aria-label="Entry type"
          className="bg-input border border-border rounded px-2 py-1 text-sm"
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as EntryType)}
        >
          <option value="comment">Comment</option>
          <option value="suggestion">Suggestion</option>
          <option value="ask_for_change">Ask for Change</option>
        </select>
      </div>
      <div>
        <label htmlFor="feedback-body" className="sr-only">
          Feedback
        </label>
        <textarea
          id="feedback-body"
          className="w-full bg-input border border-border rounded px-2 py-1 text-sm min-h-[60px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add feedback..."
        />
      </div>
      {error && <div className="text-red-500 text-xs">{error}</div>}
      <button
        type="submit"
        className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
        disabled={!authorName.trim() || !body.trim() || submitting}
        aria-label="Submit"
      >
        {submitting ? "Submitting..." : "Submit"}
      </button>
    </form>
  )
}

export function FeedbackSection({
  orchestrationId,
  targetType,
  targetRef,
}: FeedbackSectionProps) {
  const entriesResult = useTypedQuery(FeedbackEntryByTargetQuery, {
    orchestrationId,
    targetType,
    targetRef,
  })

  const resolveEntry = useMutation(api.feedbackEntries.resolveFeedbackEntry)
  const reopenEntry = useMutation(api.feedbackEntries.reopenFeedbackEntry)

  const handleResolve = async (entryId: string) => {
    await resolveEntry({
      entryId: entryId as Id<"feedbackEntries">,
      resolvedBy: "user",
    })
  }

  const handleReopen = async (entryId: string) => {
    await reopenEntry({
      entryId: entryId as Id<"feedbackEntries">,
    })
  }

  if (isAnyQueryLoading(entriesResult)) {
    return (
      <div data-testid="feedback-section-loading" className="text-xs text-muted-foreground animate-pulse py-2">
        Loading feedback...
      </div>
    )
  }

  const queryError = firstQueryError(entriesResult)
  if (queryError) {
    throw queryError
  }

  if (entriesResult.status !== "success") {
    return null
  }

  const entries = [...entriesResult.data].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  return (
    <div data-testid="feedback-section" className="space-y-2">
      <h3 className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
        Feedback
      </h3>
      {entries.length === 0 ? (
        <div className="text-xs text-muted-foreground py-1">No feedback yet</div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <FeedbackEntryItem
              key={entry._id}
              entry={entry}
              onResolve={handleResolve}
              onReopen={handleReopen}
            />
          ))}
        </ul>
      )}
      <AddFeedbackForm
        orchestrationId={orchestrationId}
        targetType={targetType}
        targetRef={targetRef}
      />
    </div>
  )
}
