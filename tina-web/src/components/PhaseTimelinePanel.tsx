import { useState, useRef } from "react"
import { useSelection } from "@/hooks/useSelection"
import { useIndexedAction } from "@/hooks/useIndexedAction"
import { useRovingSection } from "@/hooks/useRovingSection"
import { PhaseTimeline } from "@/components/ui/phase-timeline"
import { PhaseQuicklook } from "@/components/PhaseQuicklook"
import type { PhaseCardProps } from "@/components/ui/phase-card"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
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
  const status = toStatusBadgeStatus(phase.status)

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
  const { activeIndex, activeDescendantId, getItemProps } = useRovingSection({
    sectionId: "phaseTimeline",
    itemCount: detail.phases.length,
    getItemDomId: (index) => {
      const phase = detail.phases[index]
      return phase ? `phase-${phase._id}` : undefined
    },
  })
  const { phaseId, selectPhase } = useSelection()
  const [quicklookPhaseId, setQuicklookPhaseId] = useState<string | null>(null)
  const focusedElementRef = useRef<HTMLElement | null>(null)

  // Register actions for Enter and Space keys
  useIndexedAction({
    id: "phase-timeline-select",
    label: "Select Phase",
    key: "Enter",
    when: "phaseTimeline",
    items: detail.phases,
    activeIndex,
    execute: (phase) => {
      selectPhase(phase._id)
    },
  })

  // Register Space key to toggle quicklook
  useIndexedAction({
    id: "phaseTimeline.quicklook",
    label: "Quick Look",
    key: " ",
    when: "phaseTimeline",
    items: detail.phases,
    activeIndex,
    execute: (phase) => {
      if (quicklookPhaseId === phase._id) {
        // Closing quicklook
        setQuicklookPhaseId(null)
      } else {
        // Opening quicklook - save current focused element
        focusedElementRef.current = document.activeElement as HTMLElement
        setQuicklookPhaseId(phase._id)
      }
    },
  })

  const handleQuicklookClose = () => {
    setQuicklookPhaseId(null)
    // Restore focus to the previously focused phase element
    if (focusedElementRef.current) {
      focusedElementRef.current.focus()
      focusedElementRef.current = null
    }
  }

  const phaseCards: Array<PhaseCardProps & { _id: string }> = detail.phases.map((phase) => ({
    ...mapPhaseToCard(phase, detail.phaseTasks, detail.teamMembers),
    _id: phase._id,
  }))

  // Find quicklook phase data
  const quicklookPhase = quicklookPhaseId ? detail.phases.find(p => p._id === quicklookPhaseId) : null
  const quicklookTasks = quicklookPhase ? (detail.phaseTasks[quicklookPhase.phaseNumber] ?? []) as TaskEvent[] : []
  const quicklookTeamMembers = quicklookPhase
    ? detail.teamMembers.filter(m => m.phaseNumber === quicklookPhase.phaseNumber) as TeamMember[]
    : []

  return (
    <>
      <PhaseTimeline
        role="listbox"
        aria-label="Phase timeline"
        aria-activedescendant={activeDescendantId}
        phases={phaseCards.map((card, index) => {
          const isSelected = phaseId === card._id
          const phaseItemId = `phase-${card._id}`
          const rovingProps = getItemProps(index, phaseItemId)
          const isFocused = rovingProps["data-focused"] === "true"

          return {
            ...card,
            className: cn(
              "cursor-pointer transition-all",
              (isFocused || isSelected) && "rounded-lg p-2 -m-2",
              isFocused && !isSelected && "bg-muted/25",
              isSelected && "bg-primary/10"
            ),
            onClick: () => selectPhase(card._id),
            ...rovingProps,
            _id: card._id,
            "aria-current": isSelected ? ("step" as const) : undefined,
            "data-focused": rovingProps["data-focused"] as "true" | undefined,
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
          orchestrationId={detail._id}
          phase={quicklookPhase}
          tasks={quicklookTasks}
          teamMembers={quicklookTeamMembers}
          onClose={handleQuicklookClose}
        />
      )}
    </>
  )
}
