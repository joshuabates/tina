import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { SpecSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface CreateTicketModalProps {
  projectId: string
  specs: readonly SpecSummary[]
  onClose: () => void
  onCreated: (ticketId: string) => void
}

export function CreateTicketModal({
  projectId,
  specs,
  onClose,
  onCreated,
}: CreateTicketModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState("medium")
  const [specId, setSpecId] = useState("")
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
        ...(specId ? { specId: specId as Id<"specs"> } : {}),
      })
      onCreated(ticketId as unknown as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Create Ticket" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="ticket-create-form">
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
          <label className={styles.formLabel} htmlFor="ticket-spec">Spec Link</label>
          <select
            id="ticket-spec"
            className={styles.formInput}
            value={specId}
            onChange={(e) => setSpecId(e.target.value)}
          >
            <option value="">None</option>
            {specs.map((d) => (
              <option key={d._id} value={d._id}>
                {d.specKey}: {d.title}
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
            {submitting ? "Creating..." : "Create"}
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
