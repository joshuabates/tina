const STATUS_VALUES = [
  "complete",
  "done",
  "executing",
  "active",
  "planning",
  "blocked",
  "reviewing",
  "pending",
  "in_progress",
] as const

export type StatusBadgeStatus = (typeof STATUS_VALUES)[number]

interface StatusStyleTokens {
  label: string
  textClass: string
  iconBgClass: string
  borderClass: string
  badgeClass: string
}

const statusStyleMap: Record<StatusBadgeStatus, StatusStyleTokens> = {
  complete: {
    label: "Complete",
    textClass: "text-status-complete",
    iconBgClass: "bg-status-complete",
    borderClass: "border-l-status-complete",
    badgeClass: "text-status-complete border-status-complete/30 bg-status-complete/8",
  },
  done: {
    label: "Done",
    textClass: "text-status-complete",
    iconBgClass: "bg-status-complete",
    borderClass: "border-l-status-complete",
    badgeClass: "text-status-complete border-status-complete/30 bg-status-complete/8",
  },
  executing: {
    label: "Executing",
    textClass: "text-status-executing",
    iconBgClass: "bg-primary phase-glow",
    borderClass: "border-l-status-executing",
    badgeClass: "text-status-executing border-status-executing/30 bg-status-executing/12",
  },
  active: {
    label: "Active",
    textClass: "text-status-active",
    iconBgClass: "bg-primary phase-glow",
    borderClass: "border-l-status-warning",
    badgeClass: "text-status-active border-status-active/30 bg-status-active/8",
  },
  planning: {
    label: "Planning",
    textClass: "text-status-planning",
    iconBgClass: "bg-card",
    borderClass: "border-l-muted",
    badgeClass: "text-status-planning border-muted bg-transparent",
  },
  blocked: {
    label: "Blocked",
    textClass: "text-status-blocked",
    iconBgClass: "bg-status-blocked/10",
    borderClass: "border-l-status-blocked",
    badgeClass: "text-status-blocked border-status-blocked/30 bg-status-blocked/8",
  },
  reviewing: {
    label: "Reviewing",
    textClass: "text-status-warning",
    iconBgClass: "bg-status-warning",
    borderClass: "border-l-status-warning",
    badgeClass: "text-status-warning border-status-warning/30 bg-status-warning/8",
  },
  pending: {
    label: "Pending",
    textClass: "text-status-planning",
    iconBgClass: "bg-card",
    borderClass: "border-l-muted",
    badgeClass: "text-status-planning border-muted bg-transparent",
  },
  in_progress: {
    label: "In Progress",
    textClass: "text-status-executing",
    iconBgClass: "bg-primary phase-glow",
    borderClass: "border-l-status-warning",
    badgeClass: "text-status-executing border-status-executing/30 bg-status-executing/12",
  },
}

const fallbackStatus: StatusBadgeStatus = "planning"

export function toStatusBadgeStatus(rawStatus: string): StatusBadgeStatus {
  const normalized = rawStatus.trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (normalized === "completed") {
    return "complete"
  }
  return normalized in statusStyleMap
    ? (normalized as StatusBadgeStatus)
    : fallbackStatus
}

export function statusLabel(status: StatusBadgeStatus): string {
  return statusStyleMap[status]?.label ?? statusStyleMap[fallbackStatus].label
}

export function statusTextClass(status: StatusBadgeStatus): string {
  return statusStyleMap[status]?.textClass ?? "text-muted-foreground"
}

export function statusIconBgClass(status: StatusBadgeStatus): string {
  return (
    statusStyleMap[status]?.iconBgClass ??
    "border border-muted-foreground/30 bg-card"
  )
}

export function statusBorderClass(status: StatusBadgeStatus): string {
  return statusStyleMap[status]?.borderClass ?? "border-l-muted"
}

export function statusBadgeClass(status: StatusBadgeStatus): string {
  return (
    statusStyleMap[status]?.badgeClass ??
    statusStyleMap[fallbackStatus].badgeClass
  )
}
