import { useFocusable } from "@/hooks/useFocusable"
import { useSelection } from "@/hooks/useSelection"
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
): { name: string; memberStatus: MemberStatus } {
  const memberPhaseNum = parseInt(member.phaseNumber, 10)
  const memberStatus: MemberStatus = memberPhaseNum === activePhase ? "active" : "idle"

  return { name: member.agentName, memberStatus }
}

export function TeamSection({ detail }: TeamSectionProps) {
  const { phaseId } = useSelection()
  const selectedPhaseNumber = phaseId
    ? detail.phases.find((phase) => phase._id === phaseId)?.phaseNumber ?? null
    : null

  const orchestrationMembers = detail.teamMembers.map((member) =>
    mapTeamMember(member, detail.currentPhase)
  )
  const selectedPhaseMembers = selectedPhaseNumber
    ? detail.teamMembers
      .filter((member) => member.phaseNumber === selectedPhaseNumber)
      .map((member) => ({ name: member.agentName, memberStatus: "active" as MemberStatus }))
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
