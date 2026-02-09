import { cn } from "@/lib/utils";
import { MonoText } from "./mono-text";

interface AppStatusBarProps extends React.HTMLAttributes<HTMLElement> {
  sessionDuration?: string;
  projectName?: string;
  phaseName?: string;
  connected?: boolean;
}

function AppStatusBar({
  sessionDuration,
  projectName,
  phaseName,
  connected = true,
  className,
  ...props
}: AppStatusBarProps) {
  return (
    <footer
      className={cn(
        "bg-sidebar border-t border-border px-3 py-1 flex justify-between items-center shrink-0",
        className
      )}
      {...props}
    >
      <MonoText className="text-2xs flex gap-3 items-center">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              connected ? "bg-status-complete" : "bg-status-blocked"
            )}
          />
          <span className="opacity-60 text-muted-foreground uppercase">
            {sessionDuration ? `Session: ${sessionDuration}` : connected ? "Connected" : "Disconnected"}
          </span>
        </span>
        {(projectName || phaseName) && (
          <span className="text-muted-foreground">
            {[projectName, phaseName].filter(Boolean).join(" / ")}
          </span>
        )}
      </MonoText>
    </footer>
  );
}

export { AppStatusBar };
export type { AppStatusBarProps };
