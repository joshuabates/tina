import { cn } from "@/lib/utils";
import { MonoText } from "./mono-text";

type MemberStatus = "active" | "busy" | "idle" | "away" | "shutdown";

interface TeamMemberProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  memberStatus: MemberStatus;
}

const dotColorMap: Record<MemberStatus, string> = {
  active: "bg-status-complete",
  busy: "bg-primary",
  idle: "bg-status-complete",
  away: "bg-muted-foreground",
  shutdown: "bg-muted-foreground",
};

const labelMap: Record<MemberStatus, string> = {
  active: "ACTIVE",
  busy: "BUSY",
  idle: "IDLE",
  away: "AWAY",
  shutdown: "SHUTDOWN",
};

const labelColorMap: Record<MemberStatus, string> = {
  active: "text-status-complete",
  busy: "text-primary",
  idle: "opacity-40",
  away: "opacity-20",
  shutdown: "opacity-20",
};

function TeamMember({
  name,
  memberStatus,
  className,
  ...props
}: TeamMemberProps) {
  const isInactive = memberStatus === "away" || memberStatus === "shutdown";

  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            dotColorMap[memberStatus],
            memberStatus === "shutdown" && "opacity-20"
          )}
        />
        <span
          className={cn(
            "text-xs font-medium",
            isInactive && "opacity-50"
          )}
        >
          {name}
        </span>
      </div>
      <MonoText className={cn("text-[8px]", labelColorMap[memberStatus])}>
        {labelMap[memberStatus]}
      </MonoText>
    </div>
  );
}

export { TeamMember };
export type { TeamMemberProps, MemberStatus };
