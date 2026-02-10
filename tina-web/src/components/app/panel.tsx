import * as React from "react";

import { cn } from "@/lib/utils";

type PanelRootProps = React.HTMLAttributes<HTMLDivElement>;
type PanelHeaderProps = React.HTMLAttributes<HTMLDivElement>;
type PanelBodyProps = React.HTMLAttributes<HTMLDivElement> & {
  scrollable?: boolean;
};
type PanelSectionProps = React.HTMLAttributes<HTMLDivElement> & {
  label: string;
  action?: React.ReactNode;
};

const Panel = React.forwardRef<HTMLDivElement, PanelRootProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded border border-border bg-card text-card-foreground", className)}
      {...props}
    />
  ),
);
Panel.displayName = "Panel";

const PanelHeader = React.forwardRef<HTMLDivElement, PanelHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-between border-b border-border bg-muted/20 px-2 py-1",
        className,
      )}
      {...props}
    />
  ),
);
PanelHeader.displayName = "Panel.Header";

const PanelBody = React.forwardRef<HTMLDivElement, PanelBodyProps>(
  ({ className, scrollable = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("p-2", scrollable && "max-h-full overflow-auto", className)}
      {...props}
    />
  ),
);
PanelBody.displayName = "Panel.Body";

const PanelSection = React.forwardRef<HTMLDivElement, PanelSectionProps>(
  ({ className, label, action, children, ...props }, ref) => (
    <section ref={ref} className={cn("space-y-1", className)} {...props}>
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        {action}
      </div>
      <div>{children}</div>
    </section>
  ),
);
PanelSection.displayName = "Panel.Section";

export { Panel, PanelHeader, PanelBody, PanelSection };
export type { PanelRootProps, PanelHeaderProps, PanelBodyProps, PanelSectionProps };
