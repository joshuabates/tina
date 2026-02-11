import { useState } from "react"
import { Option } from "effect"
import { useParams, useSearchParams, Link } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TicketDetailQuery, DesignListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, priorityLabel } from "@/components/ui/status-styles"
import { CommentTimeline } from "./CommentTimeline"
import type { TicketSummary, DesignSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "./TicketDetailPage.module.scss"

const TICKET_STATUS_LABELS: Record<string, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  done: "Done",
  canceled: "Canceled",
}

function ticketStatusLabel(status: string): string {
  return TICKET_STATUS_LABELS[status] ?? status
}

interface TransitionAction {
  label: string
  newStatus: string
}

const STATUS_TRANSITIONS: Record<string, TransitionAction[]> = {
  todo: [
    { label: "Start", newStatus: "in_progress" },
    { label: "Block", newStatus: "blocked" },
    { label: "Cancel", newStatus: "canceled" },
  ],
  in_progress: [
    { label: "Submit for Review", newStatus: "in_review" },
    { label: "Block", newStatus: "blocked" },
    { label: "Cancel", newStatus: "canceled" },
  ],
  in_review: [
    { label: "Done", newStatus: "done" },
    { label: "Rework", newStatus: "in_progress" },
  ],
  blocked: [
    { label: "Unblock to Todo", newStatus: "todo" },
    { label: "Unblock to In Progress", newStatus: "in_progress" },
    { label: "Cancel", newStatus: "canceled" },
  ],
  done: [
    { label: "Reopen", newStatus: "todo" },
  ],
  canceled: [
    { label: "Reopen", newStatus: "todo" },
  ],
}

function TicketEditForm({
  ticket,
  designs,
  onCancel,
  onSaved,
}: {
  ticket: TicketSummary
  designs: readonly DesignSummary[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState(ticket.priority)
  const [assignee, setAssignee] = useState(
    Option.isSome(ticket.assignee) ? ticket.assignee.value : "",
  )
  const [estimate, setEstimate] = useState(
    Option.isSome(ticket.estimate) ? ticket.estimate.value : "",
  )
  const [designId, setDesignId] = useState(
    Option.isSome(ticket.designId) ? ticket.designId.value : "",
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const updateTicket = useMutation(api.tickets.updateTicket)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      await updateTicket({
        ticketId: ticket._id as Id<"tickets">,
        title: title.trim(),
        description: description.trim(),
        priority,
        ...(designId ? { designId: designId as Id<"designs"> } : {}),
        ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
        ...(estimate.trim() ? { estimate: estimate.trim() } : {}),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.editForm} onSubmit={handleSubmit} data-testid="ticket-edit-form">
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="edit-title">Title</label>
        <input
          id="edit-title"
          className={styles.formInput}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="edit-description">Description</label>
        <textarea
          id="edit-description"
          className={styles.formTextarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="edit-priority">Priority</label>
        <select
          id="edit-priority"
          className={styles.formInput}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="edit-assignee">Assignee</label>
        <input
          id="edit-assignee"
          className={styles.formInput}
          type="text"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="Assignee name"
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="edit-estimate">Estimate</label>
        <input
          id="edit-estimate"
          className={styles.formInput}
          type="text"
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          placeholder="e.g. 2h, 1d"
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="edit-design">Design Link</label>
        <select
          id="edit-design"
          className={styles.formInput}
          value={designId}
          onChange={(e) => setDesignId(e.target.value)}
        >
          <option value="">None</option>
          {designs.map((d) => (
            <option key={d._id} value={d._id}>
              {d.designKey}: {d.title}
            </option>
          ))}
        </select>
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={!title.trim() || submitting}
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export function TicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const [searchParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const projectId = searchParams.get("project") ?? ""

  const ticketResult = useTypedQuery(TicketDetailQuery, {
    ticketId: ticketId ?? "",
  })

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId,
  })

  const transitionTicket = useMutation(api.tickets.transitionTicket)

  if (isAnyQueryLoading(ticketResult, designsResult)) {
    return (
      <div data-testid="ticket-detail-page" className={styles.ticketDetail}>
        <div data-testid="ticket-detail-loading" className={styles.loading}>
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(ticketResult, designsResult)
  if (queryError) {
    throw queryError
  }

  if (ticketResult.status !== "success" || designsResult.status !== "success") {
    return null
  }

  const ticket = ticketResult.data
  const designs = designsResult.data

  if (!ticket) {
    return (
      <div data-testid="ticket-detail-page" className={styles.ticketDetail}>
        <div className={styles.notFound}>Ticket not found</div>
      </div>
    )
  }

  const designMap = new Map(designs.map((d) => [d._id, d]))
  const rawDesignId = Option.isSome(ticket.designId) ? ticket.designId.value : undefined
  const linkedDesign = rawDesignId ? designMap.get(rawDesignId) : undefined
  const transitions = STATUS_TRANSITIONS[ticket.status] ?? []

  const handleTransition = async (newStatus: string) => {
    await transitionTicket({
      ticketId: ticket._id as Id<"tickets">,
      newStatus,
    })
  }

  return (
    <div data-testid="ticket-detail-page" className={styles.ticketDetail}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <span className={styles.ticketKey}>{ticket.ticketKey}</span>
        </div>
        <div className={styles.ticketTitle}>{ticket.title}</div>
        <div className={styles.badges}>
          <StatusBadge
            status={toStatusBadgeStatus(ticket.status)}
            label={ticketStatusLabel(ticket.status)}
          />
          <span className={styles.priorityBadge} data-priority={ticket.priority}>
            {priorityLabel(ticket.priority)}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        {transitions.map((action) => (
          <button
            key={action.newStatus}
            className={styles.actionButton}
            onClick={() => handleTransition(action.newStatus)}
          >
            {action.label}
          </button>
        ))}
        <button
          className={styles.editButton}
          onClick={() => setEditing(!editing)}
        >
          Edit
        </button>
      </div>

      {editing && (
        <TicketEditForm
          ticket={ticket}
          designs={designs}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}

      <div className={styles.descriptionBody}>{ticket.description}</div>

      <div className={styles.metadataGrid}>
        <div className={styles.metadataItem} data-testid="meta-priority">
          <div className={styles.metadataLabel}>Priority</div>
          <div className={styles.metadataValue}>
            <span className={styles.priorityBadge} data-priority={ticket.priority}>
              {priorityLabel(ticket.priority)}
            </span>
          </div>
        </div>
        <div className={styles.metadataItem} data-testid="meta-assignee">
          <div className={styles.metadataLabel}>Assignee</div>
          <div className={styles.metadataValue}>
            {Option.isSome(ticket.assignee)
              ? ticket.assignee.value
              : <span className={styles.unassigned}>Unassigned</span>
            }
          </div>
        </div>
        <div className={styles.metadataItem} data-testid="meta-estimate">
          <div className={styles.metadataLabel}>Estimate</div>
          <div className={styles.metadataValue}>
            {Option.isSome(ticket.estimate)
              ? ticket.estimate.value
              : <span className={styles.unassigned}>—</span>
            }
          </div>
        </div>
        <div className={styles.metadataItem} data-testid="meta-design">
          <div className={styles.metadataLabel}>Design</div>
          <div className={styles.metadataValue}>
            {linkedDesign && rawDesignId ? (
              <Link
                to={`/pm/designs/${rawDesignId}?project=${projectId}`}
                className={styles.designLink}
              >
                {linkedDesign.designKey}: {linkedDesign.title}
              </Link>
            ) : (
              <span className={styles.unassigned}>—</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.sectionHeading}>Comments</div>
      <CommentTimeline
        projectId={projectId}
        targetType="ticket"
        targetId={ticketId ?? ""}
      />
    </div>
  )
}
