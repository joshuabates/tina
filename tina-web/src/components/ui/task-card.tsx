import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeStatus } from "./status-badge";
import { statusBorderClass } from "./status-styles";
import { MonoText } from "./mono-text";

interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  taskId: string;
  subject: string;
  status: StatusBadgeStatus;
  assignee?: string;
  duration?: string;
  blockedReason?: string;
}

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
  const borderClass = statusBorderClass(status);

  return (
    <div
      className={cn(
        "bg-muted/35 border border-border rounded-md p-2.5 border-l-2 transition-all hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[focused=true]:border-primary/40 data-[focused=true]:bg-primary/5 data-[focused=true]:ring-2 data-[focused=true]:ring-primary/40 data-[focused=true]:ring-offset-1 data-[focused=true]:ring-offset-background",
        borderClass,
        className
      )}
      {...props}
    >
      <div className="flex justify-between items-start gap-3 w-full">
        <div className="flex-1 min-w-0">
          <MonoText className="text-[8px] text-muted-foreground block leading-none mb-1">
            {taskId}
          </MonoText>
          <h4 className="font-semibold text-[13px] leading-snug">
            {subject}
          </h4>
        </div>
        <StatusBadge status={status} className="text-[7px] px-1.5 py-0.5" />
      </div>
      {(assignee || duration) && (
        <div className="flex items-center justify-between mt-1.5 text-[10px] opacity-60 w-full">
          {assignee && <span className="flex items-center gap-1.5">{assignee}</span>}
          {duration && <MonoText>{duration}</MonoText>}
        </div>
      )}
      {blockedReason && (
        <div className="mt-1.5 p-1.5 bg-status-blocked/5 rounded text-[11px] leading-snug text-status-blocked border border-status-blocked/10 w-full">
          {blockedReason}
        </div>
      )}
    </div>
  );
}

export { TaskCard };
export type { TaskCardProps };
