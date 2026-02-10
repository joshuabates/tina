import { Option } from "effect"
import { useFocusable } from "@/hooks/useFocusable"
import { PanelSection } from "@/components/Panel"
import { StatusBadge } from "@/components/ui/status-badge"
import { MonoText } from "@/components/ui/mono-text"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import type { OrchestrationDetail } from "@/schemas"

interface StatusSectionProps {
  detail: OrchestrationDetail
}

export function StatusSection({ detail }: StatusSectionProps) {
  // Register focus section
  useFocusable("rightPanel.status", 2) // 2 action buttons

  // Map status to lowercase for StatusBadge
  const status = detail.status.toLowerCase() as StatusBadgeStatus

  // Format phase progress
  const phaseProgress = `Phase ${detail.currentPhase}/${detail.totalPhases}`

  // Format elapsed time with fallback
  const elapsedTime = Option.getOrElse(
    detail.totalElapsedMins,
    () => "--"
  )
  const elapsedDisplay = elapsedTime === "--" ? "--" : `${elapsedTime}m`

  return (
    <PanelSection label="Status">
      <div className="space-y-2">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
        </div>

        {/* Metadata grid */}
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Progress:</span>
            <MonoText className="text-foreground">{phaseProgress}</MonoText>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Elapsed:</span>
            <MonoText className="text-foreground">{elapsedDisplay}</MonoText>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 pt-2">
          <button
            className="w-full px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors text-left"
            onClick={() => {
              // TODO: Open design doc
            }}
          >
            Design Plan
          </button>
          <button
            className="w-full px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded transition-colors text-left"
            onClick={() => {
              // TODO: Open phase plan
            }}
          >
            Phase Plan
          </button>
        </div>
      </div>
    </PanelSection>
  )
}
