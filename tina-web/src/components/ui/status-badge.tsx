import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-bold uppercase shrink-0 border",
  {
    variants: {
      status: {
        complete:
          "text-status-complete border-status-complete/30 bg-status-complete/8",
        executing:
          "text-status-executing border-status-executing/30 bg-status-executing/12",
        active:
          "text-status-active border-status-active/30 bg-status-active/8",
        planning:
          "text-status-planning border-muted bg-transparent",
        blocked:
          "text-status-blocked border-status-blocked/30 bg-status-blocked/8",
        reviewing:
          "text-status-warning border-status-warning/30 bg-status-warning/8",
        done:
          "text-status-complete border-status-complete/30 bg-status-complete/8",
        pending:
          "text-status-planning border-muted bg-transparent",
        in_progress:
          "text-status-executing border-status-executing/30 bg-status-executing/12",
      },
    },
    defaultVariants: {
      status: "planning",
    },
  }
);

type StatusBadgeStatus = NonNullable<
  VariantProps<typeof statusBadgeVariants>["status"]
>;

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusBadgeStatus;
  label?: string;
}

function StatusBadge({ status, label, className, ...props }: StatusBadgeProps) {
  const displayLabel = label ?? status.replace("_", " ");
  return (
    <span
      className={cn(statusBadgeVariants({ status }), className)}
      {...props}
    >
      {displayLabel}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
export type { StatusBadgeProps, StatusBadgeStatus };
