import { Option } from "effect"
import { Settings } from "lucide-react"
import { useFocusable } from "@/hooks/useFocusable"
import { MonoText } from "@/components/ui/mono-text"
import { StatPanel } from "@/components/ui/stat-panel"
import type { OrchestrationDetail } from "@/schemas"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import { statusTextClass } from "@/components/ui/status-styles"

interface StatusSectionProps {
  detail: OrchestrationDetail
}

export function StatusSection({ detail }: StatusSectionProps) {
  useFocusable("rightPanel.status", 2)

  const normalizedStatus = detail.status.toLowerCase()
  const statusLabel = normalizedStatus.toUpperCase()
  const statusColorClass = statusTextClass(normalizedStatus as StatusBadgeStatus)

  const phaseProgress = `PHASE ${detail.currentPhase}/${detail.totalPhases}`
  const progressPct = detail.totalPhases > 0
    ? Math.min(100, Math.max(0, (detail.currentPhase / detail.totalPhases) * 100))
    : 0

  const elapsedTime = Option.getOrElse(detail.totalElapsedMins, () => "--")
  const elapsedDisplay = elapsedTime === "--" ? "--" : `${elapsedTime}m`

  return (
    <StatPanel
      title="Orchestration"
      headerAction={<Settings className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className={`text-[8px] font-bold uppercase tracking-wide ${statusColorClass}`}>
            {statusLabel}
          </span>
          <MonoText className="text-[8px] text-muted-foreground">{phaseProgress}</MonoText>
        </div>

        <div className="w-full h-1 rounded-full overflow-hidden bg-muted/90">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex justify-end">
          <MonoText className="text-[8px] text-muted-foreground">ELAPSED: {elapsedDisplay}</MonoText>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="w-full px-2 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground"
            onClick={() => {
              // TODO: Open design doc
            }}
            aria-label="Open design plan"
          >
            Design Plan
          </button>
          <button
            className="w-full px-2 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground"
            onClick={() => {
              // TODO: Open phase plan
            }}
            aria-label="Open phase plan"
          >
            Phase Plan
          </button>
        </div>
      </div>
    </StatPanel>
  )
}
