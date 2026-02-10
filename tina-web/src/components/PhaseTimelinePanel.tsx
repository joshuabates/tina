import { useState } from "react"
import { useFocusable } from "@/hooks/useFocusable"
import { useSelection } from "@/hooks/useSelection"
import { useActionRegistration } from "@/hooks/useActionRegistration"
import { PhaseTimeline } from "@/components/ui/phase-timeline"
import { PhaseQuicklook } from "@/components/PhaseQuicklook"
import type { PhaseCardProps } from "@/components/ui/phase-card"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import type { OrchestrationDetail, Phase, TaskEvent, TeamMember } from "@/schemas"
import { cn } from "@/lib/utils"

interface PhaseTimelinePanelProps {
  detail: OrchestrationDetail
}

function mapPhaseToCard(
  phase: Phase,
  phaseTasks: Record<string, readonly TaskEvent[]>,
  teamMembers: readonly TeamMember[],
): PhaseCardProps {
  const phaseNum = parseInt(phase.phaseNumber, 10) || 0
  const tasks = phaseTasks[phase.phaseNumber] ?? []
  const completedCount = tasks.filter(t => t.status === "completed").length
  const teamCount = teamMembers.filter(m => m.phaseNumber === phase.phaseNumber).length
  const status = phase.status.toLowerCase() as StatusBadgeStatus

  return {
    phaseNumber: phaseNum,
    name: `Phase ${phaseNum}`,
    status,
    taskCount: tasks.length,
    completedCount,
    teamCount,
  }
}

export function PhaseTimelinePanel({ detail }: PhaseTimelinePanelProps) {
  const { isSectionFocused, activeIndex } = useFocusable("phaseTimeline", detail.phases.length)
  const { phaseId, selectPhase } = useSelection()
  const [quicklookPhaseId, setQuicklookPhaseId] = useState<string | null>(null)

  // Register actions for Enter and Space keys
  useActionRegistration({
    id: "phase-timeline-select",
    label: "Select Phase",
    key: "Enter",
    when: "phaseTimeline",
    execute: () => {
      const phase = detail.phases[activeIndex]
      if (phase) {
        selectPhase(phase._id)
      }
    },
  })

  // Register Space key to toggle quicklook
  useActionRegistration({
    id: "phaseTimeline.quicklook",
    label: "Quick Look",
    key: "Space",
    when: "phaseTimeline",
    execute: () => {
      const phase = detail.phases[activeIndex]
      if (phase) {
        setQuicklookPhaseId(quicklookPhaseId === phase._id ? null : phase._id)
      }
    },
  })

  const phaseCards: Array<PhaseCardProps & { _id: string }> = detail.phases.map((phase) => ({
    ...mapPhaseToCard(phase, detail.phaseTasks, detail.teamMembers),
    _id: phase._id,
  }))

  // Calculate aria-activedescendant for screen readers
  const activeDescendantId = isSectionFocused && activeIndex >= 0 && activeIndex < phaseCards.length
    ? `phase-${phaseCards[activeIndex]._id}`
    : undefined

  // Find quicklook phase data
  const quicklookPhase = quicklookPhaseId ? detail.phases.find(p => p._id === quicklookPhaseId) : null
  const quicklookTasks = quicklookPhase ? [...(detail.phaseTasks[quicklookPhase.phaseNumber] ?? [])] : []
  const quicklookTeamMembers = quicklookPhase
    ? [...detail.teamMembers.filter(m => m.phaseNumber === quicklookPhase.phaseNumber)]
    : []

  return (
    <>
      <PhaseTimeline
        aria-activedescendant={activeDescendantId}
        phases={phaseCards.map((card, index) => {
          const isSelected = phaseId === card._id
          const isFocused = isSectionFocused && activeIndex === index
          const phaseItemId = `phase-${card._id}`

          return {
            ...card,
            className: cn(
              "cursor-pointer transition-all",
              isFocused && !isSelected && "ring-2 ring-muted-foreground/40 rounded-lg p-2 -m-2",
              isSelected && "ring-2 ring-primary rounded-lg p-2 -m-2"
            ),
            onClick: () => selectPhase(card._id),
            tabIndex: isFocused ? 0 : -1,
            id: phaseItemId,
            _id: card._id,
            "aria-current": isSelected ? ("true" as const) : undefined,
            "data-focused": isFocused ? ("true" as const) : undefined,
          } as PhaseCardProps & {
            id: string
            _id: string
            onClick: () => void
            tabIndex: number
            "aria-current"?: "true"
            "data-focused"?: "true"
          }
        })}
      />
      {quicklookPhase && (
        <PhaseQuicklook
          phase={quicklookPhase}
          tasks={quicklookTasks}
          teamMembers={quicklookTeamMembers}
          onClose={() => setQuicklookPhaseId(null)}
        />
      )}
    </>
  )
}
