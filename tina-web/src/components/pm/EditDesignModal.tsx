import { useState } from "react"
import { FormDialog } from "@/components/FormDialog"
import type { DesignSummary } from "@/schemas"
import styles from "@/components/FormDialog.module.scss"

interface EditDesignModalProps {
  design: DesignSummary
  onClose: () => void
  onSave: (title: string, markdown: string) => void
}

export function EditDesignModal({
  design,
  onClose,
  onSave,
}: EditDesignModalProps) {
  const [title, setTitle] = useState(design.title)
  const [markdown, setMarkdown] = useState(design.markdown)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSave(title.trim(), markdown.trim())
  }

  return (
    <FormDialog title="Edit Design" onClose={onClose}>
      <form onSubmit={handleSubmit}>
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
        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!title.trim()}
          >
            Save
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
