import { MonoText } from "./mono-text";
import { StatPanel } from "./stat-panel";
import { TeamMember, type MemberStatus } from "./team-member";

interface TeamPanelMember {
  name: string;
  memberStatus: MemberStatus;
}

interface TeamPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  members: TeamPanelMember[];
}

function TeamPanel({ members, className, ...props }: TeamPanelProps) {
  const activeCount = members.filter(
    (m) => m.memberStatus === "active" || m.memberStatus === "busy"
  ).length;

  return (
    <StatPanel
      title="Team"
      className={className}
      headerAction={
        <MonoText className="text-[8px] text-status-complete">
          {activeCount} ACTIVE
        </MonoText>
      }
      {...props}
    >
      <div className="space-y-2">
        {members.length === 0 ? (
          <div className="text-xs text-muted-foreground">No team members</div>
        ) : (
          members.map((member) => (
            <TeamMember
              key={member.name}
              name={member.name}
              memberStatus={member.memberStatus}
            />
          ))
        )}
      </div>
    </StatPanel>
  );
}

export { TeamPanel as TeamPanelUI };
export type { TeamPanelProps, TeamPanelMember };
