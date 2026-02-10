import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeStatus } from "./status-badge";
import { statusIconBgClass, statusTextClass } from "./status-styles";

interface PhaseCardProps extends React.HTMLAttributes<HTMLDivElement> {
  phaseNumber: number;
  name: string;
  status: StatusBadgeStatus;
  taskCount: number;
  completedCount: number;
  teamCount: number;
}

function PhaseCard({
  phaseNumber,
  name,
  status,
  taskCount,
  completedCount,
  teamCount,
  className,
  ...props
}: PhaseCardProps) {
  const isComplete = status === "complete" || status === "done";
  const isActive =
    status === "executing" || status === "active" || status === "in_progress";
  const isFuture = status === "planning" || status === "pending";

  const iconBg = statusIconBgClass(status);
  const nameColor = statusTextClass(status);

  return (
    <div
      className={cn(
        "flex items-start gap-3 relative z-10 w-full",
        isFuture && "opacity-60",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white",
          iconBg
        )}
      >
        {isComplete ? (
          <span className="text-[14px] font-bold leading-none">&#10003;</span>
        ) : isActive ? (
          <span className="text-[14px] leading-none">&#9654;</span>
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">
            {phaseNumber}
          </span>
        )}
      </div>
      <div className="flex flex-col flex-1 gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={cn("font-bold text-xs truncate", nameColor)}>
            P{phaseNumber} {name}
          </h3>
          <StatusBadge status={status} />
        </div>
        <p className="text-2xs text-muted-foreground font-medium">
          {taskCount} tasks | {completedCount} done | {teamCount} team
        </p>
      </div>
    </div>
  );
}

export { PhaseCard };
export type { PhaseCardProps };
