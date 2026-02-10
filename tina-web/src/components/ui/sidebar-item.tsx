import { cn } from "@/lib/utils";

interface SidebarItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  active?: boolean;
  statusText?: string;
  statusColor?: string;
  "data-orchestration-id"?: string;
}

function SidebarItem({
  label,
  active = false,
  statusText,
  statusColor = "text-muted-foreground",
  className,
  ...props
}: SidebarItemProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-0.5 cursor-pointer text-xs rounded transition-colors",
        active
          ? "bg-muted/50 text-foreground"
          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
        className
      )}
      {...props}
    >
      <span className="truncate">{label}</span>
      {statusText && (
        <span className={cn("text-[7px] font-bold opacity-60 shrink-0 ml-2", statusColor)}>
          {statusText}
        </span>
      )}
    </div>
  );
}

export { SidebarItem };
export type { SidebarItemProps };
