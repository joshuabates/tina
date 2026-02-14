import { useState } from "react"
import { Option } from "effect"
import { useNavigate, Link, useParams } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TicketListQuery, SpecListQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, priorityLabel } from "@/components/ui/status-styles"
import { CreateTicketModal } from "./CreateTicketModal"
import type { TicketSummary } from "@/schemas"
import styles from "./TicketListPage.module.scss"

export function TicketListPage() {
  const { projectId: projectIdParam } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const projectId = projectIdParam ?? null

  const ticketsResult = useTypedQuery(TicketListQuery, {
    projectId: projectId as string,
  })

  const specsResult = useTypedQuery(SpecListQuery, {
    projectId: projectId as string,
  })

  if (!projectId) {
    return (
      <div data-testid="ticket-list-page" className={styles.ticketList}>
        <div className={styles.noProject}>Select a project from the sidebar</div>
      </div>
    )
  }

  if (isAnyQueryLoading(ticketsResult, specsResult)) {
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

  const queryError = firstQueryError(ticketsResult, specsResult)
  if (queryError) {
    throw queryError
  }

  if (ticketsResult.status !== "success" || specsResult.status !== "success") {
    return null
  }

  const tickets = ticketsResult.data
  const specs = specsResult.data

  const specMap = new Map(specs.map((d) => [d._id, d]))

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
          specs={specs}
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
              <th>Spec Link</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => {
              const rawSpecId = Option.isSome(ticket.specId)
                ? ticket.specId.value
                : undefined
              const spec = rawSpecId
                ? specMap.get(rawSpecId)
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
                    {spec && rawSpecId ? (
                      <Link
                        to={`/projects/${projectId}/plan/specs/${rawSpecId}`}
                        className={styles.specLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {spec.specKey}
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
