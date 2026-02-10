export type OrchestrationStatus =
  | "planning"
  | "executing"
  | "reviewing"
  | "complete"
  | "blocked";

export type PhaseStatus =
  | "planning"
  | "planned"
  | "executing"
  | "reviewing"
  | "complete"
  | "blocked";

export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

export type StatusDomain = "orchestration" | "phase" | "task";

export type UIStatus =
  | "planning"
  | "planned"
  | "executing"
  | "reviewing"
  | "complete"
  | "blocked"
  | "pending"
  | "in_progress"
  | "done";

const LABELS: Record<UIStatus, string> = {
  planning: "planning",
  planned: "planned",
  executing: "executing",
  reviewing: "reviewing",
  complete: "complete",
  blocked: "blocked",
  pending: "pending",
  in_progress: "in progress",
  done: "done",
};

/**
 * Canonical normalization for orchestration statuses.
 */
export function normalizeOrchestrationStatus(status: string): UIStatus {
  switch (status) {
    case "planning":
    case "executing":
    case "reviewing":
    case "complete":
    case "blocked":
      return status;
    default:
      return "planning";
  }
}

/**
 * Canonical normalization for phase statuses.
 */
export function normalizePhaseStatus(status: string): UIStatus {
  switch (status) {
    case "planning":
    case "planned":
    case "executing":
    case "reviewing":
    case "complete":
    case "blocked":
      return status;
    default:
      return "planning";
  }
}

/**
 * Canonical normalization for task statuses.
 */
export function normalizeTaskStatus(status: string): UIStatus {
  switch (status) {
    case "pending":
    case "in_progress":
    case "blocked":
      return status;
    case "completed":
      return "done";
    default:
      return "pending";
  }
}

/**
 * Shared entrypoint with explicit domain.
 */
export function normalizeStatus(status: string, domain: StatusDomain): UIStatus {
  switch (domain) {
    case "orchestration":
      return normalizeOrchestrationStatus(status);
    case "phase":
      return normalizePhaseStatus(status);
    case "task":
      return normalizeTaskStatus(status);
  }
}

export function statusLabel(status: string, domain: StatusDomain): string {
  return LABELS[normalizeStatus(status, domain)];
}

export function isTerminalStatus(status: string): boolean {
  return (
    status === "complete" ||
    status === "done" ||
    status === "blocked" ||
    status === "completed"
  );
}
