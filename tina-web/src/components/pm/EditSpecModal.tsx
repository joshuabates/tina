import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { SpecSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface EditSpecModalProps {
  spec: SpecSummary
  onClose: () => void
  onSaved: () => void
}

export function EditSpecModal({
  spec,
  onClose,
  onSaved,
}: EditSpecModalProps) {
  const [title, setTitle] = useState(spec.title)
  const [markdown, setMarkdown] = useState(spec.markdown)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const updateSpec = useMutation(api.specs.updateSpec)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      await updateSpec({
        specId: spec._id as Id<"specs">,
        title: title.trim(),
        markdown: markdown.trim(),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update spec")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Edit Spec" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="spec-edit-form">
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="spec-edit-title">
            Title
          </label>
          <input
            id="spec-edit-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="spec-edit-content">
            Content
          </label>
          <textarea
            id="spec-edit-content"
            className={styles.formTextarea}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
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
