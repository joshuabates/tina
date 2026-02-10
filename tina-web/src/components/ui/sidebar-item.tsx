import { cn } from "@/lib/utils";

interface SidebarItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  active?: boolean;
  statusText?: string;
  statusColor?: string;
  "data-orchestration-id"?: string;
  "data-focused"?: "true";
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
        "flex items-center justify-between px-2 py-1 cursor-pointer text-[12px] rounded-md transition-colors",
        active
          ? "bg-muted/50 text-foreground"
          : "text-muted-foreground hover:bg-muted/25 hover:text-foreground",
        className
      )}
      {...props}
    >
      <span className="truncate leading-tight">{label}</span>
      {statusText && (
        <span className={cn("text-[8px] font-semibold opacity-55 shrink-0 ml-2", statusColor)}>
          {statusText}
        </span>
      )}
    </div>
  );
}

export { SidebarItem };
export type { SidebarItemProps };
