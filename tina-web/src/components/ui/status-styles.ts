import type { StatusBadgeStatus } from "./status-badge"

const statusColorMap: Record<StatusBadgeStatus, string> = {
  complete: "text-status-complete",
  done: "text-status-complete",
  executing: "text-status-executing",
  active: "text-status-active",
  planning: "text-status-planning",
  blocked: "text-status-blocked",
  reviewing: "text-status-warning",
  pending: "text-status-planning",
  in_progress: "text-status-executing",
}

const statusIconBgMap: Record<StatusBadgeStatus, string> = {
  complete: "bg-status-complete",
  done: "bg-status-complete",
  executing: "bg-primary phase-glow",
  active: "bg-primary phase-glow",
  in_progress: "bg-primary phase-glow",
  reviewing: "bg-status-warning",
  planning: "bg-card",
  pending: "bg-card",
  blocked: "bg-status-blocked/10",
}

const statusBorderMap: Record<StatusBadgeStatus, string> = {
  complete: "border-l-status-complete",
  done: "border-l-status-complete",
  executing: "border-l-status-executing",
  active: "border-l-status-warning",
  in_progress: "border-l-status-warning",
  blocked: "border-l-status-blocked",
  planning: "border-l-muted",
  pending: "border-l-muted",
  reviewing: "border-l-status-warning",
}

export function statusTextClass(status: StatusBadgeStatus): string {
  return statusColorMap[status] ?? "text-muted-foreground"
}

export function statusIconBgClass(status: StatusBadgeStatus): string {
  return statusIconBgMap[status] ?? "border border-muted-foreground/30 bg-card"
}

export function statusBorderClass(status: StatusBadgeStatus): string {
  return statusBorderMap[status] ?? "border-l-muted"
}
