import { useState } from "react"
import { FormDialog } from "@/components/FormDialog"
import type { CreateSessionResponse } from "@/lib/daemon"
import { fetchDaemon } from "@/hooks/useDaemonQuery"
import styles from "@/components/FormDialog.module.scss"

interface NewSessionDialogProps {
  onClose: () => void
  onCreated: (paneId: string) => void
}

export function NewSessionDialog({ onClose, onCreated }: NewSessionDialogProps) {
  const [label, setLabel] = useState("")
  const [cli, setCli] = useState<"claude" | "codex">("claude")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const data = await fetchDaemon<CreateSessionResponse>(
        "/sessions",
        {},
        "POST",
        { label: label.trim(), cli },
      )
      onCreated(data.tmuxPaneId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="New Session" onClose={onClose} maxWidth={420}>
      <form onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="session-label">
            Label
          </label>
          <input
            id="session-label"
            className={styles.formInput}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Discuss auth middleware"
            autoFocus
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="session-cli">
            CLI
          </label>
          <select
            id="session-cli"
            className={styles.formInput}
            value={cli}
            onChange={(e) => setCli(e.target.value as "claude" | "codex")}
          >
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting || !label.trim()}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
