import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { DesignSummary } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface EditDesignModalProps {
  design: DesignSummary
  onClose: () => void
  onSaved: () => void
}

export function EditDesignModal({
  design,
  onClose,
  onSaved,
}: EditDesignModalProps) {
  const [title, setTitle] = useState(design.title)
  const [markdown, setMarkdown] = useState(design.markdown)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const updateDesign = useMutation(api.designs.updateDesign)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      await updateDesign({
        designId: design._id as Id<"designs">,
        title: title.trim(),
        markdown: markdown.trim(),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update design")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Edit Design" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="design-edit-form">
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-edit-title">
            Title
          </label>
          <input
            id="design-edit-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-edit-content">
            Content
          </label>
          <textarea
            id="design-edit-content"
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
