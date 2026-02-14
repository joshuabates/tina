import { useState } from "react"
import { Option } from "effect"
import { useParams, Link } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TicketDetailQuery, SpecListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, priorityLabel } from "@/components/ui/status-styles"
import { CommentTimeline } from "./CommentTimeline"
import { EditTicketModal } from "./EditTicketModal"
import type { Id } from "@convex/_generated/dataModel"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import styles from "./TicketDetailPage.module.scss"
import markdownStyles from "../PlanQuicklook.module.scss"


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

export function TicketDetailPage() {
  const { ticketId, projectId: routeProjectId } = useParams<{
    ticketId: string
    projectId: string
  }>()
  const [editing, setEditing] = useState(false)

  const ticketResult = useTypedQuery(TicketDetailQuery, {
    ticketId: ticketId ?? "",
  })

  const resolvedProjectId =
    routeProjectId ??
    (ticketResult.status === "success" && ticketResult.data
      ? ticketResult.data.projectId
      : null)

  const specsResult = useTypedQuery(SpecListQuery, {
    projectId: resolvedProjectId as string,
  })

  const transitionTicket = useMutation(api.tickets.transitionTicket)

  if (isAnyQueryLoading(ticketResult)) {
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

  const ticketQueryError = firstQueryError(ticketResult)
  if (ticketQueryError) {
    throw ticketQueryError
  }

  if (ticketResult.status !== "success") {
    return null
  }

  const ticket = ticketResult.data

  if (!ticket) {
    return (
      <div data-testid="ticket-detail-page" className={styles.ticketDetail}>
        <div className={styles.notFound}>Ticket not found</div>
      </div>
    )
  }

  if (isAnyQueryLoading(specsResult)) {
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

  const specsQueryError = firstQueryError(specsResult)
  if (specsQueryError) {
    throw specsQueryError
  }

  if (specsResult.status !== "success") {
    return null
  }

  const specs = specsResult.data
  const projectId = routeProjectId ?? ticket.projectId
  const ticketsPath = `/projects/${projectId}/plan/tickets`

  const specMap = new Map(specs.map((d) => [d._id, d]))
  const rawSpecId = Option.isSome(ticket.specId) ? ticket.specId.value : undefined
  const linkedSpec = rawSpecId ? specMap.get(rawSpecId) : undefined
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
          <Link
            to={ticketsPath}
            className={styles.backLink}
            aria-label="Back to tickets list"
          >
            Back to tickets
          </Link>
          <span className={styles.ticketKey}>{ticket.ticketKey}</span>
        </div>
        <div className={styles.ticketTitle}>{ticket.title}</div>
        <div className={styles.badges}>
          <StatusBadge
            status={toStatusBadgeStatus(ticket.status)}
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
        <EditTicketModal
          ticket={ticket}
          specs={specs}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}

      <MarkdownRenderer className={`${styles.descriptionBody} ${markdownStyles.content}`}>
        {ticket.description}
      </MarkdownRenderer>

      <div className={styles.metadataGrid}>
        <div className={styles.metadataItem} data-testid="meta-priority">
          <div className={styles.metadataLabel}>Priority</div>
          <div className={styles.metadataValue}>
            <span className={styles.priorityBadge} data-priority={ticket.priority}>
              {priorityLabel(ticket.priority)}
            </span>
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
        <div className={styles.metadataItem} data-testid="meta-spec">
          <div className={styles.metadataLabel}>Spec</div>
          <div className={styles.metadataValue}>
            {linkedSpec && rawSpecId ? (
              <Link
                to={`/projects/${projectId}/plan/specs/${rawSpecId}`}
                className={styles.specLink}
              >
                {linkedSpec.specKey}: {linkedSpec.title}
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
