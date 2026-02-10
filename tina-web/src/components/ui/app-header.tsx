import { cn } from "@/lib/utils";
import { MonoText } from "./mono-text";

interface AppHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  version?: string;
  children?: React.ReactNode;
}

function AppHeader({
  title = "ORCHESTRATOR",
  version,
  children,
  className,
  ...props
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "border-b border-border bg-sidebar px-3 py-1 flex justify-between items-center shrink-0",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-tighter text-primary">
          {title}
        </span>
        {version && (
          <>
            <div className="h-3 w-px bg-muted-foreground/30 mx-1" />
            <MonoText className="text-2xs opacity-40">{version}</MonoText>
          </>
        )}
      </div>
      {children && <div className="flex items-center gap-4">{children}</div>}
    </header>
  );
}

export { AppHeader };
export type { AppHeaderProps };
