import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeStatus } from "./status-badge";
import { MonoText } from "./mono-text";

interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  taskId: string;
  subject: string;
  status: StatusBadgeStatus;
  assignee?: string;
  duration?: string;
  blockedReason?: string;
}

const borderColorMap: Record<string, string> = {
  complete: "border-l-status-complete",
  done: "border-l-status-complete",
  executing: "border-l-status-executing",
  active: "border-l-status-warning",
  in_progress: "border-l-status-warning",
  blocked: "border-l-status-blocked",
  planning: "border-l-muted",
  pending: "border-l-muted",
  reviewing: "border-l-status-warning",
};

function TaskCard({
  taskId,
  subject,
  status,
  assignee,
  duration,
  blockedReason,
  className,
  ...props
}: TaskCardProps) {
  const borderClass = borderColorMap[status] ?? "border-l-muted";

  return (
    <div
      className={cn(
        "bg-muted/40 border border-border rounded p-3 border-l-2 transition-all hover:border-muted-foreground/30",
        borderClass,
        className
      )}
      {...props}
    >
      <div className="flex justify-between items-start gap-4 w-full">
        <div className="flex-1 min-w-0">
          <MonoText className="text-[8px] text-muted-foreground block leading-none mb-1.5">
            {taskId}
          </MonoText>
          <h4 className="font-semibold text-sm leading-tight">
            {subject}
          </h4>
        </div>
        <StatusBadge status={status} />
      </div>
      {(assignee || duration) && (
        <div className="flex items-center justify-between mt-2 text-2xs opacity-60 w-full">
          {assignee && <span className="flex items-center gap-1.5">{assignee}</span>}
          {duration && <MonoText>{duration}</MonoText>}
        </div>
      )}
      {blockedReason && (
        <div className="mt-2 p-2 bg-status-blocked/5 rounded text-xs text-status-blocked border border-status-blocked/10 w-full">
          {blockedReason}
        </div>
      )}
    </div>
  );
}

export { TaskCard };
export type { TaskCardProps };
