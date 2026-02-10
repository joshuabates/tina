import { cn } from "@/lib/utils";

interface StatPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  headerAction?: React.ReactNode;
  showHeader?: boolean;
  children: React.ReactNode;
}

function StatPanel({
  title,
  headerAction,
  showHeader = true,
  children,
  className,
  ...props
}: StatPanelProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-md flex flex-col overflow-hidden",
        className
      )}
      {...props}
    >
      {showHeader && (
        <div className="px-2 py-1 bg-sidebar/55 border-b border-border/80 flex justify-between items-center">
          <h3 className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
            {title}
          </h3>
          {headerAction}
        </div>
      )}
      <div className="p-2">{children}</div>
    </div>
  );
}

export { StatPanel };
export type { StatPanelProps };
