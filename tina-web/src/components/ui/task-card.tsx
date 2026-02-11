import { cn } from "@/lib/utils";
import type { StatusBadgeStatus } from "./status-badge";
import { statusTextClass } from "./status-styles";
import { MonoText } from "./mono-text";
import { LoaderCircle, Square, SquareCheck } from "lucide-react";

interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  taskId: string;
  subject: string;
  status: StatusBadgeStatus;
  assignee?: string;
  duration?: string;
  blockedReason?: string;
}

type TaskStateIndicatorVariant = "complete" | "in_progress" | "pending";

function taskStateIndicator(status: StatusBadgeStatus): TaskStateIndicatorVariant {
  switch (status) {
    case "complete":
    case "done":
      return "complete";
    case "executing":
    case "active":
    case "reviewing":
    case "in_progress":
      return "in_progress";
    default:
      return "pending";
  }
}

function taskStateLabel(indicator: TaskStateIndicatorVariant): string {
  switch (indicator) {
    case "complete":
      return "Task complete";
    case "in_progress":
      return "Task in progress";
    default:
      return "Task not complete";
  }
}

function TaskStatusIndicator({ status }: { status: StatusBadgeStatus }) {
  const indicator = taskStateIndicator(status);
  const iconClassName = cn(
    "h-4 w-4",
    statusTextClass(status),
    indicator === "pending" && "opacity-70"
  );

  if (indicator === "complete") {
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" role="img" aria-label={taskStateLabel(indicator)}>
        <SquareCheck className={iconClassName} aria-hidden="true" />
      </span>
    );
  }

  if (indicator === "in_progress") {
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" role="img" aria-label={taskStateLabel(indicator)}>
        <LoaderCircle className={cn(iconClassName, "animate-spin")} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" role="img" aria-label={taskStateLabel(indicator)}>
      <Square className={iconClassName} aria-hidden="true" />
    </span>
  );
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
  return (
    <div
      className={cn(
        "bg-muted/35 border border-border rounded-md p-2.5 transition-all hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[focused=true]:border-primary/40 data-[focused=true]:bg-primary/5 data-[focused=true]:ring-2 data-[focused=true]:ring-primary/40 data-[focused=true]:ring-offset-1 data-[focused=true]:ring-offset-background",
        className
      )}
      data-task-id={taskId}
      {...props}
    >
      <div className="flex items-start gap-3 w-full">
        <TaskStatusIndicator status={status} />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-[13px] leading-snug min-w-0">
            {subject}
          </h4>
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
      </div>
    </div>
  );
}

export { TaskCard };
export type { TaskCardProps };
