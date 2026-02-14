import { cn } from "@/lib/utils"
import { MonoText } from "./mono-text";
import { TeamMember, type MemberStatus } from "./team-member";

interface TeamPanelMember {
  name: string;
  memberStatus: MemberStatus;
  tmuxPaneId?: string;
}

interface TeamPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  members: TeamPanelMember[];
  emptyMessage: string
  onConnect?: (paneId: string) => void
}

function TeamPanel({ title, members, emptyMessage, onConnect, className, ...props }: TeamPanelProps) {
  const activeCount = members.filter(
    (m) => m.memberStatus === "active" || m.memberStatus === "busy"
  ).length;

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        <MonoText className="text-[8px] text-status-complete">
          {activeCount} ACTIVE
        </MonoText>
      </div>
      <div className="mt-2 space-y-2">
        {members.length === 0 ? (
          <div className="text-xs text-muted-foreground">{emptyMessage}</div>
        ) : (
          members.map((member) => (
            <TeamMember
              key={member.name}
              name={member.name}
              memberStatus={member.memberStatus}
              onConnect={member.tmuxPaneId && onConnect ? () => onConnect(member.tmuxPaneId!) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

export { TeamPanel as TeamPanelUI };
export type { TeamPanelProps, TeamPanelMember };
