import { useEffect, useRef, useId } from "react"
import { Option } from "effect"
import { StatusBadge } from "@/components/ui/status-badge"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import type { TaskEvent } from "@/schemas"
import styles from "./TaskQuicklook.module.scss"

export interface TaskQuicklookProps {
  task: TaskEvent
  onClose: () => void
}

export function TaskQuicklook({ task, onClose }: TaskQuicklookProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const status = task.status.toLowerCase() as StatusBadgeStatus

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault()
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Focus modal on mount
  useEffect(() => {
    modalRef.current?.focus()
  }, [])

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return

      if (e.shiftKey) {
        if (document.activeElement === firstElement || document.activeElement === modal) {
          e.preventDefault()
          if (lastElement) {
            lastElement.focus()
          } else {
            modal.focus()
          }
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          modal.focus()
        }
      }
    }

    modal.addEventListener("keydown", handleTab)
    return () => modal.removeEventListener("keydown", handleTab)
  }, [])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {task.subject}
          </h2>
          <StatusBadge status={status} />
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close quicklook"
          >
            ×
          </button>
        </div>

        <div className={styles.content}>
          {/* Description Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Description</h3>
            <div className={styles.value}>
              {Option.match(task.description, {
                onNone: () => "No description",
                onSome: (desc) => desc,
              })}
            </div>
          </section>

          {/* Details Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Details</h3>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.label}>Owner:</span>
                <span className={styles.value}>
                  {Option.match(task.owner, {
                    onNone: () => "—",
                    onSome: (owner) => owner,
                  })}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.label}>Phase:</span>
                <span className={styles.value}>
                  {Option.match(task.phaseNumber, {
                    onNone: () => "—",
                    onSome: (phase) => phase,
                  })}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.label}>Recorded:</span>
                <span className={styles.value}>
                  {new Date(task.recordedAt).toLocaleString()}
                </span>
              </div>
            </div>
          </section>

          {/* Blocked By Section - only show when present */}
          {Option.isSome(task.blockedBy) && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Blocked By</h3>
              <div className={styles.value}>
                {Option.getOrNull(task.blockedBy)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
