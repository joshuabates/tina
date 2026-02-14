import { useState } from "react"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { CommentListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { formatRelativeTimeShort } from "@/lib/time"
import type { WorkComment } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "./CommentTimeline.module.scss"

interface CommentTimelineProps {
  projectId: string
  targetType: "spec" | "ticket"
  targetId: string
}

function CommentItem({ comment }: { comment: WorkComment }) {
  return (
    <li className={styles.commentItem}>
      <div className={styles.commentHeader}>
        <span className={styles.authorName}>{comment.authorName}</span>
        <span className={styles.authorBadge} data-testid="author-badge">
          {comment.authorType}
        </span>
        <span className={styles.commentTime}>
          {formatRelativeTimeShort(comment.createdAt)}
        </span>
      </div>
      <div className={styles.commentBody}>{comment.body}</div>
    </li>
  )
}

function AddCommentForm({
  projectId,
  targetType,
  targetId,
}: CommentTimelineProps) {
  const [authorName, setAuthorName] = useState("")
  const [body, setBody] = useState("")
  const [authorType, setAuthorType] = useState<"human" | "agent">("human")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const addComment = useMutation(api.workComments.addComment)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!authorName.trim() || !body.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      await addComment({
        projectId: projectId as Id<"projects">,
        targetType,
        targetId,
        authorType,
        authorName: authorName.trim(),
        body: body.trim(),
      })
      setAuthorName("")
      setBody("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.addCommentForm} onSubmit={handleSubmit}>
      <div className={styles.formRow}>
        <label htmlFor="comment-author" className={styles.srOnly}>
          Author name
        </label>
        <input
          id="comment-author"
          className={styles.commentInput}
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Author name"
        />
        <div className={styles.authorToggle}>
          <button
            type="button"
            className={styles.toggleOption}
            data-active={authorType === "human"}
            onClick={() => setAuthorType("human")}
          >
            human
          </button>
          <button
            type="button"
            className={styles.toggleOption}
            data-active={authorType === "agent"}
            onClick={() => setAuthorType("agent")}
          >
            agent
          </button>
        </div>
      </div>
      <div className={styles.formRow}>
        <label htmlFor="comment-body" className={styles.srOnly}>
          Comment
        </label>
        <textarea
          id="comment-body"
          className={styles.commentTextarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment..."
        />
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
      <div className={styles.formRow}>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={!authorName.trim() || !body.trim() || submitting}
        >
          {submitting ? "Adding..." : "Add comment"}
        </button>
      </div>
    </form>
  )
}

export function CommentTimeline({
  projectId,
  targetType,
  targetId,
}: CommentTimelineProps) {
  const commentsResult = useTypedQuery(CommentListQuery, {
    targetType,
    targetId,
  })

  if (isAnyQueryLoading(commentsResult)) {
    return (
      <div className={styles.commentTimeline} data-testid="comment-timeline-loading">
        <div className={styles.skeletonRow} />
        <div className={styles.skeletonRow} />
      </div>
    )
  }

  const queryError = firstQueryError(commentsResult)
  if (queryError) {
    throw queryError
  }

  if (commentsResult.status !== "success") {
    return null
  }

  const comments = commentsResult.data

  return (
    <div className={styles.commentTimeline} data-testid="comment-timeline">
      {comments.length === 0 ? (
        <div className={styles.empty}>No comments yet</div>
      ) : (
        <ul className={styles.commentList}>
          {comments.map((comment) => (
            <CommentItem key={comment._id} comment={comment} />
          ))}
        </ul>
      )}
      <AddCommentForm
        projectId={projectId}
        targetType={targetType}
        targetId={targetId}
      />
    </div>
  )
}
