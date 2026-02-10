import { cn } from "@/lib/utils";
import { statusLabel, type StatusBadgeStatus } from "./status-styles";

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

  const iconTone = isComplete
    ? "bg-status-complete/25 border border-status-complete/40 text-status-complete"
    : isActive
      ? "bg-primary/20 border border-primary/35 text-primary/90"
      : "bg-card border border-border text-muted-foreground";

  const nameTone = isFuture
    ? "text-muted-foreground/90"
    : "text-foreground/90";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 relative z-10 w-full",
        isFuture && "opacity-70",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0",
          iconTone
        )}
      >
        {isComplete ? (
          <span className="text-[11px] font-bold leading-none">&#10003;</span>
        ) : isActive ? (
          <span className="text-[10px] leading-none">&#9654;</span>
        ) : (
          <span className="text-[9px] font-semibold">
            {phaseNumber}
          </span>
        )}
      </div>
      <div className="flex flex-col flex-1 gap-0.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className={cn("font-semibold text-xs truncate", nameTone)}>
            P{phaseNumber} {name}
          </h3>
          <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground/65 shrink-0">
            {statusLabel(status)}
          </span>
        </div>
        <p className="text-2xs text-muted-foreground/80 font-medium">
          {taskCount} tasks | {completedCount} done | {teamCount} team
        </p>
      </div>
    </div>
  );
}

export { PhaseCard };
export type { PhaseCardProps };
