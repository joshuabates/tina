import { useState } from "react"
import { Option } from "effect"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { TicketSummary, DesignSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface EditTicketModalProps {
  ticket: TicketSummary
  designs: readonly DesignSummary[]
  onClose: () => void
  onSaved: () => void
}

export function EditTicketModal({
  ticket,
  designs,
  onClose,
  onSaved,
}: EditTicketModalProps) {
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState(ticket.priority)
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
      const payload: {
        ticketId: Id<"tickets">
        title: string
        description: string
        priority: string
        designId?: Id<"designs">
        clearDesignId?: boolean
        estimate?: string
      } = {
        ticketId: ticket._id as Id<"tickets">,
        title: title.trim(),
        description: description.trim(),
        priority,
        ...(estimate.trim() ? { estimate: estimate.trim() } : {}),
      }
      if (designId) {
        payload.designId = designId as Id<"designs">
      } else if (Option.isSome(ticket.designId)) {
        payload.clearDesignId = true
      }
      await updateTicket(payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Edit Ticket" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="ticket-edit-form">
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
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
