import { useState } from "react"
import { Option } from "effect"
import { Settings, Pause, Play, RotateCcw } from "lucide-react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useFocusable } from "@/hooks/useFocusable"
import { MonoText } from "@/components/ui/mono-text"
import { StatPanel } from "@/components/ui/stat-panel"
import type { OrchestrationDetail } from "@/schemas"
import {
  statusLabel,
  statusTextClass,
  toStatusBadgeStatus,
} from "@/components/ui/status-styles"

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

type ControlActionType = "pause" | "resume" | "retry"

const PAUSABLE_STATUSES = new Set(["executing", "planning", "reviewing"])
const RESUMABLE_STATUSES = new Set(["blocked"])
const RETRYABLE_STATUSES = new Set(["blocked"])

interface StatusSectionProps {
  detail: OrchestrationDetail
}

export function StatusSection({ detail }: StatusSectionProps) {
  useFocusable("rightPanel.status", 2)

  const enqueueAction = useMutation(api.controlPlane.enqueueControlAction)
  const [pendingAction, setPendingAction] = useState<ControlActionType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const normalizedStatus = toStatusBadgeStatus(detail.status)
  const statusDisplayLabel = statusLabel(normalizedStatus).toUpperCase()
  const statusColorClass = statusTextClass(normalizedStatus)

  const phaseProgress = `PHASE ${detail.currentPhase}/${detail.totalPhases}`
  const progressPct = detail.totalPhases > 0
    ? Math.min(100, Math.max(0, (detail.currentPhase / detail.totalPhases) * 100))
    : 0

  const elapsedTime = Option.getOrElse(detail.totalElapsedMins, () => "--")
  const elapsedDisplay = elapsedTime === "--" ? "--" : `${elapsedTime}m`

  const canPause = PAUSABLE_STATUSES.has(detail.status) && !pendingAction
  const canResume = RESUMABLE_STATUSES.has(detail.status) && !pendingAction
  const canRetry = RETRYABLE_STATUSES.has(detail.status) && !pendingAction

  const handleControlAction = async (actionType: ControlActionType) => {
    setPendingAction(actionType)
    setActionError(null)

    const payload: Record<string, string> = { feature: detail.featureName }
    if (actionType !== "resume") {
      payload.phase = String(detail.currentPhase)
    }

    try {
      await enqueueAction({
        orchestrationId: detail._id as Id<"orchestrations">,
        nodeId: detail.nodeId as Id<"nodes">,
        actionType,
        payload: JSON.stringify(payload),
        requestedBy: "web-ui",
        idempotencyKey: generateIdempotencyKey(),
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <StatPanel
      title="Orchestration"
      headerAction={<Settings className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className={`text-[8px] font-semibold uppercase tracking-wide opacity-80 ${statusColorClass}`}>
            {statusDisplayLabel}
          </span>
          <MonoText className="text-[8px] text-muted-foreground">{phaseProgress}</MonoText>
        </div>

        <div className="w-full h-1 rounded-full overflow-hidden bg-muted/70">
          <div
            className="h-full rounded-full bg-primary/65 transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex justify-end">
          <MonoText className="text-[8px] text-muted-foreground">ELAPSED: {elapsedDisplay}</MonoText>
        </div>

        {actionError && (
          <div className="text-[7px] text-status-blocked truncate" role="alert">
            {actionError}
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5">
          <button
            className="w-full flex items-center justify-center gap-1 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground disabled:opacity-40 disabled:pointer-events-none"
            disabled={!canPause}
            onClick={() => handleControlAction("pause")}
            aria-label="Pause orchestration"
            data-testid="control-pause"
          >
            <Pause className="h-2.5 w-2.5" />
            {pendingAction === "pause" ? "..." : "Pause"}
          </button>
          <button
            className="w-full flex items-center justify-center gap-1 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground disabled:opacity-40 disabled:pointer-events-none"
            disabled={!canResume}
            onClick={() => handleControlAction("resume")}
            aria-label="Resume orchestration"
            data-testid="control-resume"
          >
            <Play className="h-2.5 w-2.5" />
            {pendingAction === "resume" ? "..." : "Resume"}
          </button>
          <button
            className="w-full flex items-center justify-center gap-1 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground disabled:opacity-40 disabled:pointer-events-none"
            disabled={!canRetry}
            onClick={() => handleControlAction("retry")}
            aria-label="Retry orchestration phase"
            data-testid="control-retry"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            {pendingAction === "retry" ? "..." : "Retry"}
          </button>
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
