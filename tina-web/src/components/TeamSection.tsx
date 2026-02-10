import React from "react"
import { Option } from "effect"
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
  shutdownMap: Map<string, string>,
): { name: string; memberStatus: MemberStatus } {
  const memberPhaseNum = parseInt(member.phaseNumber, 10)

  // Check if agent has been shut down
  if (shutdownMap.has(member.agentName)) {
    return { name: member.agentName, memberStatus: "shutdown" }
  }

  const memberStatus: MemberStatus = memberPhaseNum === activePhase ? "active" : "idle"

  return { name: member.agentName, memberStatus }
}

export function TeamSection({ detail }: TeamSectionProps) {
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

  const orchestrationMembers = detail.teamMembers.map((member) =>
    mapTeamMember(member, detail.currentPhase, shutdownMap)
  )
  const selectedPhaseMembers = selectedPhaseNumber
    ? detail.teamMembers
      .filter((member) => member.phaseNumber === selectedPhaseNumber)
      .map((member) => mapTeamMember(member, detail.currentPhase, shutdownMap))
    : []

  useFocusable("rightPanel.team", orchestrationMembers.length + selectedPhaseMembers.length)

  return (
    <StatPanel title="Team" showHeader={false}>
      <div className="space-y-3">
        <TeamPanelUI
          title="Orchestration Team"
          members={orchestrationMembers}
          emptyMessage="No team members"
        />

        <TeamPanelUI
          title="Selected Phase"
          members={selectedPhaseMembers}
          emptyMessage={
            !selectedPhaseNumber
              ? "No phase selected"
              : "No team in this phase"
          }
        />
      </div>
    </StatPanel>
  )
}
