import React from "react"
import { Option } from "effect"
import { useCreateSession } from "@/hooks/useCreateSession"
import { useFocusable } from "@/hooks/useFocusable"
import { useSelection } from "@/hooks/useSelection"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { EventListQuery } from "@/services/data/queryDefs"
import { StatPanel } from "@/components/ui/stat-panel"
import { TeamPanelUI } from "@/components/ui/team-panel"
import type { MemberStatus } from "@/components/ui/team-member"
import type { OrchestrationDetail, TeamMember as OrchestrationTeamMember } from "@/schemas"

interface TeamSectionProps {
  detail: OrchestrationDetail
}

function mapTeamMember(
  member: OrchestrationTeamMember,
  activePhase: number,
): { name: string; memberStatus: MemberStatus; tmuxPaneId?: string } {
  const memberPhaseNum = Number(member.phaseNumber)

  const memberStatus: MemberStatus = memberPhaseNum === activePhase ? "active" : "idle"

  return {
    name: member.agentName,
    memberStatus,
    tmuxPaneId: Option.getOrUndefined(member.tmuxPaneId),
  }
}

function isOrchestrationScopeMember(member: OrchestrationTeamMember): boolean {
  const phaseNumber = Number(member.phaseNumber)
  return !Number.isFinite(phaseNumber) || phaseNumber <= 0
}

export function TeamSection({ detail }: TeamSectionProps) {
  const { connectToPane } = useCreateSession()
  const { phaseId } = useSelection()
  const selectedPhaseNumber = phaseId
    ? detail.phases.find((phase) => phase._id === phaseId)?.phaseNumber ?? null
    : null

  // Query for shutdown events
  const shutdownEventsResult = useTypedQuery(EventListQuery, {
    orchestrationId: detail._id,
    eventType: "agent_shutdown",
  })

  // Build shutdown map from events
  const shutdownMap = React.useMemo(() => {
    if (shutdownEventsResult.status !== "success" || !shutdownEventsResult.data) {
      return new Map<string, string>()
    }

    const map = new Map<string, string>()
    for (const event of shutdownEventsResult.data) {
      Option.match(event.detail, {
        onNone: () => {}, // Skip if no detail
        onSome: (detailStr) => {
          try {
            const detail = JSON.parse(detailStr)
            if (detail.agent_name && detail.shutdown_detected_at) {
              map.set(detail.agent_name, detail.shutdown_detected_at)
            }
          } catch {
            // Ignore parse errors
          }
        },
      })
    }
    return map
  }, [shutdownEventsResult])

  const activeMembers = detail.teamMembers.filter(
    (member) => !shutdownMap.has(member.agentName),
  )

  const orchestrationMembers = activeMembers
    .filter(isOrchestrationScopeMember)
    .map((member) => mapTeamMember(member, detail.currentPhase))
  const selectedPhaseMembers = selectedPhaseNumber
    ? activeMembers
      .filter((member) => member.phaseNumber === selectedPhaseNumber)
      .map((member) => mapTeamMember(member, detail.currentPhase))
    : []

  useFocusable("rightPanel.team", orchestrationMembers.length + selectedPhaseMembers.length)

  return (
    <StatPanel title="Team" showHeader={false}>
      <div className="space-y-3">
        <TeamPanelUI
          title="Orchestration Team"
          members={orchestrationMembers}
          emptyMessage="No team members"
          onConnect={connectToPane}
        />

        <TeamPanelUI
          title="Selected Phase"
          members={selectedPhaseMembers}
          emptyMessage={
            !selectedPhaseNumber
              ? "No phase selected"
              : "No team in this phase"
          }
          onConnect={connectToPane}
        />
      </div>
    </StatPanel>
  )
}
