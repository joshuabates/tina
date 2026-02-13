import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface SidebarItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  active?: boolean;
  statusText?: string;
  statusColor?: string;
  statusIndicatorClass?: string;
  onDelete?: React.MouseEventHandler<HTMLButtonElement>;
  deleting?: boolean;
  "data-orchestration-id"?: string;
  "data-focused"?: "true";
}

function SidebarItem({
  label,
  active = false,
  statusText,
  statusColor = "text-muted-foreground",
  statusIndicatorClass,
  onDelete,
  deleting = false,
  className,
  ...props
}: SidebarItemProps) {
  const shouldRenderDelete = onDelete !== undefined;
  const shouldRenderStatusDot = statusIndicatorClass !== undefined
  const dotClass = statusIndicatorClass ?? "bg-muted-foreground/50"

  return (
    <div
      className={cn(
        "group/item flex items-center justify-between px-2 py-1 cursor-pointer rounded-md transition-colors",
        active
          ? "bg-muted/50 text-foreground"
          : "text-muted-foreground/95 hover:bg-muted/25 hover:text-foreground cursor-pointer",
        className
      )}
      {...props}
    >
      {shouldRenderStatusDot && (
        <span
          className={cn("mr-1.5 h-1.5 w-1.5 rounded-full shrink-0", dotClass)}
          aria-hidden="true"
          data-status-indicator="true"
        />
      )}
      <span className="truncate leading-tight">{label}</span>
      {shouldRenderDelete && (
        <button
          type="button"
          aria-label={`Delete orchestration ${label}`}
          title={`Delete ${label}`}
          disabled={deleting}
          className={cn(
            "ml-auto inline-flex h-6 w-6 items-center justify-center rounded border border-border/60 transition",
            "opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto",
            "focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            deleting
              ? "cursor-not-allowed text-muted-foreground/50"
              : "text-muted-foreground/80 hover:text-destructive hover:bg-destructive/10"
          )}
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.(event);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export { SidebarItem };
export type { SidebarItemProps };
