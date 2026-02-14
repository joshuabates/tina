import { useState } from "react"
import { Option } from "effect"
import { useNavigate, Link, useParams } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TicketListQuery, DesignListQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { formatRelativeTimeShort } from "@/lib/time"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, priorityLabel } from "@/components/ui/status-styles"
import { CreateTicketModal } from "./CreateTicketModal"
import type { TicketSummary } from "@/schemas"
import styles from "./TicketListPage.module.scss"

function openedAtLabel(createdAt: string): string {
  const relative = formatRelativeTimeShort(createdAt)
  return relative === "--" ? "opened recently" : `opened ${relative} ago`
}

function isInteractiveElement(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement
    && target.closest("a, button, input, select, textarea") !== null
  )
}

export function TicketListPage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const projectId = projectIdParam ?? null

  const ticketsResult = useTypedQuery(TicketListQuery, {
    projectId: projectId as string,
  })

  const designsResult = useTypedQuery(DesignListQuery, {
    projectId: projectId as string,
  })

  if (!projectId) {
    return (
      <div data-testid="ticket-list-page" className={styles.ticketList}>
        <div className={styles.noProject}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(ticketsResult, designsResult)) {
    return (
      <div data-testid="ticket-list-page" className={styles.ticketList}>
        <div className={styles.header}>
          <h2 className={styles.title}>Tickets</h2>
        </div>
        <div data-testid="ticket-list-loading" className={styles.loading}>
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(ticketsResult, designsResult)
  if (queryError) {
    throw queryError
  }

  if (ticketsResult.status !== "success" || designsResult.status !== "success") {
    return null
  }

  const tickets = ticketsResult.data
  const designs = designsResult.data

  const designMap = new Map(designs.map((d) => [d._id, d]))

  const handleRowClick = (ticket: TicketSummary) => {
    navigate(`/projects/${projectId}/plan/tickets/${ticket._id}`)
  }

  const handleCreated = (ticketId: string) => {
    setShowCreateForm(false)
    navigate(`/projects/${projectId}/plan/tickets/${ticketId}`)
  }

  return (
    <div data-testid="ticket-list-page" className={styles.ticketList}>
      <div className={styles.header}>
        <h2 className={styles.title}>Tickets</h2>
        <button
          className={styles.createButton}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          Create Ticket
        </button>
      </div>

      {showCreateForm && (
        <CreateTicketModal
          projectId={projectId}
          designs={designs}
          onClose={() => setShowCreateForm(false)}
          onCreated={handleCreated}
        />
      )}

      {tickets.length === 0 ? (
        <div className={styles.empty}>No tickets yet. Create one to get started.</div>
      ) : (
        <table className={styles.table} role="table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Design Link</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => {
              const rawDesignId = Option.isSome(ticket.designId)
                ? ticket.designId.value
                : undefined
              const design = rawDesignId
                ? designMap.get(rawDesignId)
                : undefined
              const description = ticket.description.trim()
              const showDescription =
                description.length > 0
                && description !== ticket.title.trim()
              const openedLabel = openedAtLabel(ticket.createdAt)

              return (
                <tr
                  key={ticket._id}
                  className={styles.tableRow}
                  onClick={() => handleRowClick(ticket)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") {
                      return
                    }
                    if (
                      event.target !== event.currentTarget
                      && isInteractiveElement(event.target)
                    ) {
                      return
                    }
                    event.preventDefault()
                    handleRowClick(ticket)
                  }}
                  tabIndex={0}
                  role="row"
                >
                  <td className={styles.ticketCell}>
                    <div className={styles.ticketTitle}>{ticket.title}</div>
                    <div
                      className={styles.ticketMeta}
                      data-testid={`ticket-meta-${ticket._id}`}
                    >
                      <span className={styles.ticketKey}>{ticket.ticketKey}</span>
                      <span aria-hidden="true">·</span>
                      <span>{openedLabel}</span>
                    </div>
                    {showDescription ? (
                      <div className={styles.ticketDescription}>{description}</div>
                    ) : null}
                  </td>
                  <td>
                    <StatusBadge
                      status={toStatusBadgeStatus(ticket.status)}
                    />
                  </td>
                  <td>
                    <span className={styles.priorityBadge} data-priority={ticket.priority}>
                      {priorityLabel(ticket.priority)}
                    </span>
                  </td>
                  <td>
                    {design && rawDesignId ? (
                      <Link
                        to={`/projects/${projectId}/plan/designs/${rawDesignId}`}
                        className={styles.designLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {design.designKey}
                      </Link>
                    ) : (
                      <span className={styles.unassigned}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
