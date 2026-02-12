import { useState } from "react"
import { Option } from "effect"
import { useSearchParams, useNavigate, Link } from "react-router-dom"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TicketListQuery, DesignListQuery } from "@/services/data/queryDefs"
import { api } from "@convex/_generated/api"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus, priorityLabel } from "@/components/ui/status-styles"
import type { TicketSummary, DesignSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "./TicketListPage.module.scss"


function TicketCreateForm({
  projectId,
  designs,
  onCancel,
  onCreated,
}: {
  projectId: string
  designs: readonly DesignSummary[]
  onCancel: () => void
  onCreated: (ticketId: string) => void
}) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [designId, setDesignId] = useState("")
  const [assignee, setAssignee] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const createTicket = useMutation(api.tickets.createTicket)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const ticketId = await createTicket({
        projectId: projectId as Id<"projects">,
        title: title.trim(),
        description: description.trim(),
        priority,
        ...(designId ? { designId: designId as Id<"designs"> } : {}),
        ...(assignee.trim() ? { assignee: assignee.trim() } : {}),
      })
      onCreated(ticketId as unknown as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.createForm} onSubmit={handleSubmit} data-testid="ticket-create-form">
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="ticket-title">Title</label>
        <input
          id="ticket-title"
          className={styles.formInput}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ticket title"
          autoFocus
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="ticket-description">Description</label>
        <textarea
          id="ticket-description"
          className={styles.formTextarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ticket description"
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="ticket-priority">Priority</label>
        <select
          id="ticket-priority"
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
        <label className={styles.formLabel} htmlFor="ticket-design">Design Link</label>
        <select
          id="ticket-design"
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
      <div className={styles.formField}>
        <label className={styles.formLabel} htmlFor="ticket-assignee">Assignee</label>
        <input
          id="ticket-assignee"
          className={styles.formInput}
          type="text"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          placeholder="Assignee name"
        />
      </div>
      {error && <div className={styles.errorMessage}>{error}</div>}
      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={!title.trim() || submitting}
        >
          {submitting ? "Creating..." : "Create"}
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
        <TicketCreateForm
          projectId={projectId}
          designs={designs}
          onCancel={() => setShowCreateForm(false)}
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
