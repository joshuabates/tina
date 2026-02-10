import { forwardRef, type HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("flex flex-col", className)} {...props} />
  }
)
Panel.displayName = "Panel"

export const PanelHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("px-3 py-2 font-medium text-sm border-b", className)}
        {...props}
      />
    )
  }
)
PanelHeader.displayName = "PanelHeader"

interface PanelBodyProps extends HTMLAttributes<HTMLDivElement> {
  scrollable?: boolean
}

export const PanelBody = forwardRef<HTMLDivElement, PanelBodyProps>(
  ({ className, scrollable, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex-1", scrollable && "overflow-y-auto", className)}
        {...props}
      />
    )
  }
)
PanelBody.displayName = "PanelBody"

interface PanelSectionProps extends HTMLAttributes<HTMLDivElement> {
  label: string
}

export const PanelSection = forwardRef<HTMLDivElement, PanelSectionProps>(
  ({ className, label, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("px-3 py-2", className)} {...props}>
        <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
        {children}
      </div>
    )
  }
)
PanelSection.displayName = "PanelSection"
