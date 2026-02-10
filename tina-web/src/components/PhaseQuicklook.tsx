import { Option } from "effect"
import type { Phase, TaskEvent, TeamMember } from "@/schemas"
import { cn } from "@/lib/utils"
import { QuicklookDialog } from "@/components/QuicklookDialog"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import styles from "./QuicklookDialog.module.scss"
import phaseStyles from "./PhaseQuicklook.module.scss"

export interface PhaseQuicklookProps {
  phase: Phase
  tasks: TaskEvent[]
  teamMembers: TeamMember[]
  onClose: () => void
}

export function PhaseQuicklook({ phase, tasks, teamMembers, onClose }: PhaseQuicklookProps) {
  const status = toStatusBadgeStatus(phase.status)

  // Calculate task completion
  const completedCount = tasks.filter(t => t.status === "completed").length
  const taskCount = tasks.length

  return (
    <QuicklookDialog title={`Phase ${phase.phaseNumber}`} status={status} onClose={onClose}>
      <section className={styles.section}>
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

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Plan</h3>
        <div className={styles.value}>
          {Option.match(phase.planPath, {
            onNone: () => "—",
            onSome: (path) => path.split("/").pop() || path,
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Git Range</h3>
        <div className={cn(styles.value, styles.mono)}>
          {Option.match(phase.gitRange, {
            onNone: () => "—",
            onSome: (range) => range,
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Tasks</h3>
        <div className={styles.value}>
          {completedCount}/{taskCount} tasks complete
        </div>
      </section>

      <section className={styles.section}>
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
    </QuicklookDialog>
  )
}
