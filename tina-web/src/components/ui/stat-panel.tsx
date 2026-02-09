import { cn } from "@/lib/utils";

interface StatPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

function StatPanel({
  title,
  headerAction,
  children,
  className,
  ...props
}: StatPanelProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded flex flex-col overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="px-2 py-1 bg-muted/20 border-b border-border flex justify-between items-center">
        <h3 className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        {headerAction}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

export { StatPanel };
export type { StatPanelProps };
