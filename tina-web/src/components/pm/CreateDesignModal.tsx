import { useState } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

interface CreateDesignModalProps {
  projectId: string
  onClose: () => void
  onCreated: (designId: string) => void
}

export function CreateDesignModal({
  projectId,
  onClose,
  onCreated,
}: CreateDesignModalProps) {
  const [title, setTitle] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const createDesign = useMutation(api.designs.createDesign)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      const designId = await createDesign({
        projectId: projectId as Id<"projects">,
        title: title.trim(),
        markdown: markdown.trim(),
      })
      onCreated(designId as unknown as string)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create design")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="Create Design" onClose={onClose}>
      <form onSubmit={handleSubmit} data-testid="design-create-form">
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-title">
            Title
          </label>
          <input
            id="design-title"
            className={styles.formInput}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Design title"
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-markdown">
            Content
          </label>
          <textarea
            id="design-markdown"
            className={styles.formTextarea}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Design content (markdown)"
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
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
