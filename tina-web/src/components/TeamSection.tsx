import { useFocusable } from "@/hooks/useFocusable"
import { useSelection } from "@/hooks/useSelection"
import { StatPanel } from "@/components/ui/stat-panel"
import { MonoText } from "@/components/ui/mono-text"
import { TeamMember, type MemberStatus } from "@/components/ui/team-member"
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

  const orchestrationActiveCount = orchestrationMembers.filter(
    (member) => member.memberStatus === "active" || member.memberStatus === "busy",
  ).length
  const selectedActiveCount = selectedPhaseMembers.filter(
    (member) => member.memberStatus === "active" || member.memberStatus === "busy",
  ).length

  useFocusable("rightPanel.team", orchestrationMembers.length + selectedPhaseMembers.length)

  return (
    <StatPanel title="Team" showHeader={false}>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
              Orchestration Team
            </span>
            <MonoText className="text-[8px] text-status-complete">
              {orchestrationActiveCount} ACTIVE
            </MonoText>
          </div>
          <div className="mt-2 space-y-2">
            {orchestrationMembers.length === 0 ? (
              <div className="text-xs text-muted-foreground">No team members</div>
            ) : (
              orchestrationMembers.map((member) => (
                <TeamMember
                  key={`orch-${member.name}`}
                  name={member.name}
                  memberStatus={member.memberStatus}
                />
              ))
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
              Selected Phase
            </span>
            <MonoText className="text-[8px] text-status-complete">
              {selectedActiveCount} ACTIVE
            </MonoText>
          </div>
          <div className="mt-2 space-y-2">
            {!selectedPhaseNumber ? (
              <div className="text-xs text-muted-foreground">No phase selected</div>
            ) : selectedPhaseMembers.length === 0 ? (
              <div className="text-xs text-muted-foreground">No team in this phase</div>
            ) : (
              selectedPhaseMembers.map((member) => (
                <TeamMember
                  key={`phase-${member.name}`}
                  name={member.name}
                  memberStatus={member.memberStatus}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </StatPanel>
  )
}
