import { cn } from "@/lib/utils";
import {
  statusBadgeClass,
  statusLabel,
  type StatusBadgeStatus,
} from "./status-styles";

const baseStatusBadgeClass =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-bold uppercase shrink-0 border"

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusBadgeStatus;
  label?: string;
}

function StatusBadge({ status, label, className, ...props }: StatusBadgeProps) {
  const displayLabel = label ?? statusLabel(status);
  return (
    <span
      className={cn(baseStatusBadgeClass, statusBadgeClass(status), className)}
      {...props}
    >
      {displayLabel}
    </span>
  );
}

export { StatusBadge };
export type { StatusBadgeProps, StatusBadgeStatus };
