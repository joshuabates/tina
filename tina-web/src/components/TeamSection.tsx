import { useFocusable } from "@/hooks/useFocusable"
import { PanelSection } from "@/components/Panel"
import { TeamPanelUI, type TeamPanelMember } from "@/components/ui/team-panel"
import type { MemberStatus } from "@/components/ui/team-member"
import type { OrchestrationDetail, TeamMember } from "@/schemas"

interface TeamSectionProps {
  detail: OrchestrationDetail
}

function mapTeamMember(member: TeamMember, currentPhase: number): TeamPanelMember {
  const memberPhaseNum = parseInt(member.phaseNumber, 10)
  const memberStatus: MemberStatus = memberPhaseNum === currentPhase ? "active" : "idle"

  return {
    name: member.agentName,
    memberStatus,
  }
}

export function TeamSection({ detail }: TeamSectionProps) {
  const members: TeamPanelMember[] = detail.teamMembers.map((member) =>
    mapTeamMember(member, detail.currentPhase)
  )

  useFocusable("rightPanel.team", members.length)

  return (
    <PanelSection label="Team">
      <TeamPanelUI members={members} />
    </PanelSection>
  )
}
