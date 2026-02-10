import { useState } from "react"
import { Option } from "effect"
import type { Phase, TaskEvent, TeamMember } from "@/schemas"
import { cn } from "@/lib/utils"
import { optionNullableText, optionText } from "@/lib/option-display"
import { QuicklookDialog } from "@/components/QuicklookDialog"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import { PlanQuicklook } from "./PlanQuicklook"
import { CommitListPanel } from "./CommitListPanel"
import styles from "./QuicklookDialog.module.scss"
import phaseStyles from "./PhaseQuicklook.module.scss"

export interface PhaseQuicklookProps {
  orchestrationId: string
  phase: Phase
  tasks: TaskEvent[]
  teamMembers: TeamMember[]
  onClose: () => void
}

export function PhaseQuicklook({ orchestrationId, phase, tasks, teamMembers, onClose }: PhaseQuicklookProps) {
  const [showPlanQuicklook, setShowPlanQuicklook] = useState(false)
  const status = toStatusBadgeStatus(phase.status)

  // Calculate task completion
  const completedCount = tasks.filter(t => t.status === "completed").length
  const taskCount = tasks.length

  return (
    <>
      <QuicklookDialog title={`Phase ${phase.phaseNumber}`} status={status} onClose={onClose}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Timing</h3>
          <div className={phaseStyles.timingGrid}>
            <div className={phaseStyles.timingItem}>
              <span className={styles.label}>Planning:</span>
              <span className={styles.value}>
                {optionText(phase.planningMins, (mins) => `${mins} min`)}
              </span>
            </div>
            <div className={phaseStyles.timingItem}>
              <span className={styles.label}>Execution:</span>
              <span className={styles.value}>
                {optionText(phase.executionMins, (mins) => `${mins} min`)}
              </span>
            </div>
            <div className={phaseStyles.timingItem}>
              <span className={styles.label}>Review:</span>
              <span className={styles.value}>
                {optionText(phase.reviewMins, (mins) => `${mins} min`)}
              </span>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Plan</h3>
          {Option.match(phase.planPath, {
            onNone: () => <div className={styles.value}>No plan</div>,
            onSome: (path) => (
              <button
                onClick={() => setShowPlanQuicklook(true)}
                className="text-primary hover:underline"
              >
                {path.split("/").pop() || path}
              </button>
            ),
          })}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Git Range</h3>
          <div className={cn(styles.value, styles.mono)}>
            {optionText(phase.gitRange, (range) => range)}
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
                <TeamMemberRow key={member._id} member={member} />
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Commits</h3>
          <CommitListPanel
            orchestrationId={orchestrationId}
            phaseNumber={phase.phaseNumber}
          />
        </section>
      </QuicklookDialog>

      {showPlanQuicklook && (
        <PlanQuicklook
          orchestrationId={orchestrationId}
          phaseNumber={phase.phaseNumber}
          onClose={() => setShowPlanQuicklook(false)}
        />
      )}
    </>
  )
}

function TeamMemberRow({ member }: { member: TeamMember }) {
  const agentType = optionNullableText(member.agentType, (value) => value)

  return (
    <li className={phaseStyles.teamMember}>
      <span className={phaseStyles.agentName}>{member.agentName}</span>
      {agentType && <span className={phaseStyles.agentType}>{agentType}</span>}
    </li>
  )
}
