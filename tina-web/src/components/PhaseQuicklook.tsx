import { useEffect, useRef, useId } from "react"
import { Option } from "effect"
import { StatusBadge } from "@/components/ui/status-badge"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import type { Phase, TaskEvent, TeamMember } from "@/schemas"
import { cn } from "@/lib/utils"
import styles from "./PhaseQuicklook.module.scss"

export interface PhaseQuicklookProps {
  phase: Phase
  tasks: TaskEvent[]
  teamMembers: TeamMember[]
  onClose: () => void
}

export function PhaseQuicklook({ phase, tasks, teamMembers, onClose }: PhaseQuicklookProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const status = phase.status.toLowerCase() as StatusBadgeStatus

  // Calculate task completion
  const completedCount = tasks.filter(t => t.status === "completed").length
  const taskCount = tasks.length

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
            Phase {phase.phaseNumber}
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
          {/* Timing Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Timing</h3>
            <div className={styles.timingGrid}>
              <div className={styles.timingItem}>
                <span className={styles.label}>Planning:</span>
                <span className={styles.value}>
                  {Option.match(phase.planningMins, {
                    onNone: () => "—",
                    onSome: (mins) => `${mins} min`,
                  })}
                </span>
              </div>
              <div className={styles.timingItem}>
                <span className={styles.label}>Execution:</span>
                <span className={styles.value}>
                  {Option.match(phase.executionMins, {
                    onNone: () => "—",
                    onSome: (mins) => `${mins} min`,
                  })}
                </span>
              </div>
              <div className={styles.timingItem}>
                <span className={styles.label}>Review:</span>
                <span className={styles.value}>
                  {Option.match(phase.reviewMins, {
                    onNone: () => "—",
                    onSome: (mins) => `${mins} min`,
                  })}
                </span>
              </div>
            </div>
          </section>

          {/* Plan Path Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Plan</h3>
            <div className={styles.value}>
              {Option.match(phase.planPath, {
                onNone: () => "—",
                onSome: (path) => path.split("/").pop() || path,
              })}
            </div>
          </section>

          {/* Git Range Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Git Range</h3>
            <div className={cn(styles.value, styles.mono)}>
              {Option.match(phase.gitRange, {
                onNone: () => "—",
                onSome: (range) => range,
              })}
            </div>
          </section>

          {/* Task Summary Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Tasks</h3>
            <div className={styles.value}>
              {completedCount}/{taskCount} tasks complete
            </div>
          </section>

          {/* Team Members Section */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Team</h3>
            {teamMembers.length === 0 ? (
              <div className={styles.value}>No team members</div>
            ) : (
              <ul className={styles.teamList}>
                {teamMembers.map((member) => (
                  <li key={member._id} className={styles.teamMember}>
                    <span className={styles.agentName}>{member.agentName}</span>
                    {Option.match(member.agentType, {
                      onNone: () => null,
                      onSome: (type) => (
                        <span className={styles.agentType}>{type}</span>
                      ),
                    })}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
