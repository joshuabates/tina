import { cn } from "@/lib/utils";
import { MonoText } from "./mono-text";
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
    <div
      className={cn(
        "bg-card border border-border rounded flex flex-col overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="px-2 py-1 bg-muted/20 border-b border-border flex justify-between items-center">
        <h3 className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
          Team
        </h3>
        <MonoText className="text-[8px] text-status-complete">
          {activeCount} ACTIVE
        </MonoText>
      </div>
      <div className="p-2 space-y-2">
        {members.map((member) => (
          <TeamMember
            key={member.name}
            name={member.name}
            memberStatus={member.memberStatus}
          />
        ))}
      </div>
    </div>
  );
}

export { TeamPanel as TeamPanelUI };
export type { TeamPanelProps, TeamPanelMember };
