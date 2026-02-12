import { useState, useRef } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import { FormDialog } from "@/components/FormDialog"
import type { Id } from "@convex/_generated/dataModel"
import styles from "@/components/FormDialog.module.scss"

const COMPLEXITY_OPTIONS = [
  { value: "simple", label: "Simple", description: "Minimal checklist" },
  { value: "standard", label: "Standard", description: "Default checklist" },
  { value: "complex", label: "Complex", description: "Extended checklist" },
] as const

interface CreateDesignModalProps {
  projectId: string
  onClose: () => void
  onCreated: (designId: string) => void
}

function extractTitleFromMarkdown(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ""
}

export function CreateDesignModal({
  projectId,
  onClose,
  onCreated,
}: CreateDesignModalProps) {
  const [title, setTitle] = useState("")
  const [markdown, setMarkdown] = useState("")
  const [complexityPreset, setComplexityPreset] = useState("standard")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createDesign = useMutation(api.designs.createDesign)

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setMarkdown(text)

    if (!title.trim()) {
      const extracted = extractTitleFromMarkdown(text)
      if (extracted) setTitle(extracted)
    }

    // Reset input so the same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

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
        complexityPreset,
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
          <label className={styles.formLabel}>Complexity</label>
          <div data-testid="complexity-selector" style={{ display: "flex", gap: "var(--space-sm)" }}>
            {COMPLEXITY_OPTIONS.map((opt) => (
              <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="complexity"
                  value={opt.value}
                  checked={complexityPreset === opt.value}
                  onChange={() => setComplexityPreset(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="design-markdown">
            Content
          </label>
          <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-xs)" }}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => fileInputRef.current?.click()}
            >
              Import Markdown
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              style={{ display: "none" }}
              onChange={handleImportFile}
              data-testid="markdown-file-input"
            />
          </div>
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
