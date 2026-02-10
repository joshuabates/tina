import { useId } from "react"
import { Option } from "effect"
import { StatusBadge } from "@/components/ui/status-badge"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import type { Phase, TaskEvent, TeamMember } from "@/schemas"
import { cn } from "@/lib/utils"
import { useQuicklookDialog } from "@/hooks/useQuicklookDialog"
import styles from "./QuicklookDialog.module.scss"
import phaseStyles from "./PhaseQuicklook.module.scss"

export interface PhaseQuicklookProps {
  phase: Phase
  tasks: TaskEvent[]
  teamMembers: TeamMember[]
  onClose: () => void
}

export function PhaseQuicklook({ phase, tasks, teamMembers, onClose }: PhaseQuicklookProps) {
  const titleId = useId()
  const status = phase.status.toLowerCase() as StatusBadgeStatus
  const { modalRef } = useQuicklookDialog(onClose)

  // Calculate task completion
  const completedCount = tasks.filter(t => t.status === "completed").length
  const taskCount = tasks.length

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
          <section className={phaseStyles.section}>
            <h3 className={styles.sectionTitle}>Timing</h3>
            <div className={phaseStyles.timingGrid}>
              <div className={phaseStyles.timingItem}>
                <span className={styles.label}>Planning:</span>
                <span className={styles.value}>
                  {Option.match(phase.planningMins, {
                    onNone: () => "—",
                    onSome: (mins) => `${mins} min`,
                  })}
                </span>
              </div>
              <div className={phaseStyles.timingItem}>
                <span className={styles.label}>Execution:</span>
                <span className={styles.value}>
                  {Option.match(phase.executionMins, {
                    onNone: () => "—",
                    onSome: (mins) => `${mins} min`,
                  })}
                </span>
              </div>
              <div className={phaseStyles.timingItem}>
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
          <section className={phaseStyles.section}>
            <h3 className={styles.sectionTitle}>Plan</h3>
            <div className={styles.value}>
              {Option.match(phase.planPath, {
                onNone: () => "—",
                onSome: (path) => path.split("/").pop() || path,
              })}
            </div>
          </section>

          {/* Git Range Section */}
          <section className={phaseStyles.section}>
            <h3 className={styles.sectionTitle}>Git Range</h3>
            <div className={cn(styles.value, styles.mono)}>
              {Option.match(phase.gitRange, {
                onNone: () => "—",
                onSome: (range) => range,
              })}
            </div>
          </section>

          {/* Task Summary Section */}
          <section className={phaseStyles.section}>
            <h3 className={styles.sectionTitle}>Tasks</h3>
            <div className={styles.value}>
              {completedCount}/{taskCount} tasks complete
            </div>
          </section>

          {/* Team Members Section */}
          <section className={phaseStyles.section}>
            <h3 className={styles.sectionTitle}>Team</h3>
            {teamMembers.length === 0 ? (
              <div className={styles.value}>No team members</div>
            ) : (
              <ul className={phaseStyles.teamList}>
                {teamMembers.map((member) => (
                  <li key={member._id} className={phaseStyles.teamMember}>
                    <span className={phaseStyles.agentName}>{member.agentName}</span>
                    {Option.match(member.agentType, {
                      onNone: () => null,
                      onSome: (type) => (
                        <span className={phaseStyles.agentType}>{type}</span>
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
