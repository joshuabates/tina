import { useState } from "react"
import { Option } from "effect"
import { useSearchParams, useNavigate, Link } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TicketListQuery, DesignListQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, priorityLabel } from "@/components/ui/status-styles"
import { CreateTicketModal } from "./CreateTicketModal"
import type { TicketSummary } from "@/schemas"
import styles from "./TicketListPage.module.scss"

export function TicketListPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const projectId = searchParams.get("project") || null

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
    navigate(`/pm/tickets/${ticket._id}?project=${projectId}`)
  }

  const handleCreated = (ticketId: string) => {
    setShowCreateForm(false)
    navigate(`/pm/tickets/${ticketId}?project=${projectId}`)
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
              <th>Assignee</th>
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

              return (
                <tr
                  key={ticket._id}
                  onClick={() => handleRowClick(ticket)}
                  role="row"
                >
                  <td>
                    <div className={styles.ticketKey}>{ticket.ticketKey}</div>
                    <div className={styles.ticketTitle}>{ticket.title}</div>
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
                        to={`/pm/designs/${rawDesignId}?project=${projectId}`}
                        className={styles.designLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {design.designKey}
                      </Link>
                    ) : (
                      <span className={styles.unassigned}>—</span>
                    )}
                  </td>
                  <td>
                    {Option.isSome(ticket.assignee)
                      ? ticket.assignee.value
                      : <span className={styles.unassigned}>—</span>
                    }
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
