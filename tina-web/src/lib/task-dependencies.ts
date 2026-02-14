import { Option } from "effect"
import type { TaskEvent } from "@/schemas"

const COMPLETED_STATUSES = new Set(["completed", "complete", "done"])
const IN_PROGRESS_STATUSES = new Set([
  "in_progress",
  "in progress",
  "executing",
  "active",
  "reviewing",
  "running",
])

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase()
}

function isDependencyToken(token: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(token)
}

export function isTaskCompleted(status: string): boolean {
  return COMPLETED_STATUSES.has(normalizeStatus(status))
}

export function isTaskInProgress(status: string): boolean {
  return IN_PROGRESS_STATUSES.has(normalizeStatus(status))
}

export function parseBlockedByDependencies(rawBlockedBy: string): string[] | null {
  const trimmed = rawBlockedBy.trim()
  if (trimmed.length === 0) {
    return []
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => {
            if (typeof value === "string") {
              return value.trim()
            }
            if (typeof value === "number" && Number.isFinite(value)) {
              return String(value)
            }
            return ""
          })
          .filter((value) => value.length > 0)
      }
    } catch {
      // Fall through to tokenized parsing.
    }
  }

  const tokens = trimmed
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  if (tokens.length > 0 && tokens.every(isDependencyToken)) {
    return tokens
  }

  return null
}

export function formatBlockedByForDisplay(rawBlockedBy: string | undefined): string | undefined {
  if (!rawBlockedBy) return undefined

  const dependencies = parseBlockedByDependencies(rawBlockedBy)
  if (dependencies === null) {
    const trimmed = rawBlockedBy.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  return dependencies.length > 0 ? dependencies.join(",") : undefined
}

export function resolveTaskBlockedReason(
  rawBlockedBy: string | undefined,
  tasksById: ReadonlyMap<string, TaskEvent>,
): string | undefined {
  if (!rawBlockedBy) return undefined

  const dependencies = parseBlockedByDependencies(rawBlockedBy)
  if (dependencies === null) {
    const trimmed = rawBlockedBy.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  const unresolvedDependencies = dependencies.filter((dependencyId) => {
    const dependencyTask = tasksById.get(dependencyId)
    if (!dependencyTask) return true
    return !isTaskCompleted(dependencyTask.status)
  })

  if (unresolvedDependencies.length === 0) {
    return undefined
  }

  const labels = unresolvedDependencies.map((dependencyId) => {
    const dependencyTask = tasksById.get(dependencyId)
    if (!dependencyTask) {
      return dependencyId
    }
    return dependencyTask.subject
  })

  return `Blocked by ${labels.join(", ")}`
}

export function orderTasksByDependency(tasks: readonly TaskEvent[]): TaskEvent[] {
  if (tasks.length <= 1) {
    return [...tasks]
  }

  const taskById = new Map<string, TaskEvent>()
  const indexByTaskId = new Map<string, number>()

  tasks.forEach((task, index) => {
    if (!taskById.has(task.taskId)) {
      taskById.set(task.taskId, task)
      indexByTaskId.set(task.taskId, index)
    }
  })

  const orderedUniqueTasks = Array.from(taskById.values())

  const runningTasks = orderedUniqueTasks
    .filter((task) => isTaskInProgress(task.status))
    .sort((a, b) => compareByRecordedAtAsc(a, b, indexByTaskId))

  const nextTasks = topologicalOrderTasks(
    orderedUniqueTasks.filter(
      (task) => !isTaskInProgress(task.status) && !isTaskCompleted(task.status),
    ),
    indexByTaskId,
  )

  const completedTasks = orderedUniqueTasks
    .filter((task) => isTaskCompleted(task.status))
    .sort((a, b) => compareByRecordedAtAsc(a, b, indexByTaskId))

  return [...runningTasks, ...nextTasks, ...completedTasks]
}

function compareByRecordedAtAsc(
  a: TaskEvent,
  b: TaskEvent,
  indexByTaskId: ReadonlyMap<string, number>,
): number {
  if (a.recordedAt < b.recordedAt) return -1
  if (a.recordedAt > b.recordedAt) return 1

  return compareTaskIds(a.taskId, b.taskId, indexByTaskId)
}

function toNumericTaskId(taskId: string): number | undefined {
  if (!/^\d+$/.test(taskId)) {
    return undefined
  }

  const parsed = Number(taskId)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function compareTaskIds(
  a: string,
  b: string,
  indexByTaskId: ReadonlyMap<string, number>,
): number {
  const aNumber = toNumericTaskId(a)
  const bNumber = toNumericTaskId(b)

  if (aNumber !== undefined && bNumber !== undefined && aNumber !== bNumber) {
    return aNumber - bNumber
  }

  if (aNumber === undefined && bNumber === undefined && a !== b) {
    return a.localeCompare(b)
  }

  return (
    (indexByTaskId.get(a) ?? Number.MAX_SAFE_INTEGER) -
    (indexByTaskId.get(b) ?? Number.MAX_SAFE_INTEGER)
  )
}

function topologicalOrderTasks(
  tasks: readonly TaskEvent[],
  indexByTaskId: ReadonlyMap<string, number>,
): TaskEvent[] {
  if (tasks.length <= 1) {
    return [...tasks]
  }

  const taskById = new Map(tasks.map((task) => [task.taskId, task]))
  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  const taskIds = Array.from(taskById.keys())

  for (const taskId of taskIds) {
    indegree.set(taskId, 0)
    dependents.set(taskId, [])
  }

  for (const task of tasks) {
    const blockedBy = Option.getOrUndefined(task.blockedBy)
    const parsed = blockedBy ? parseBlockedByDependencies(blockedBy) : []
    const dependencyIds = parsed ?? []

    for (const dependencyId of dependencyIds) {
      if (dependencyId === task.taskId || !taskById.has(dependencyId)) {
        continue
      }

      indegree.set(task.taskId, (indegree.get(task.taskId) ?? 0) + 1)
      dependents.get(dependencyId)?.push(task.taskId)
    }
  }

  const byDependencyOrder = (a: string, b: string) =>
    compareTaskIds(a, b, indexByTaskId)

  const ready: string[] = taskIds
    .filter((taskId) => (indegree.get(taskId) ?? 0) === 0)
    .sort(byDependencyOrder)

  const orderedTaskIds: string[] = []

  while (ready.length > 0) {
    const current = ready.shift()
    if (!current) break

    orderedTaskIds.push(current)

    for (const dependentId of dependents.get(current) ?? []) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1
      indegree.set(dependentId, nextIndegree)
      if (nextIndegree === 0) {
        ready.push(dependentId)
        ready.sort(byDependencyOrder)
      }
    }
  }

  // Cycles or malformed dependency graphs fall back to deterministic id order.
  for (const taskId of taskIds.sort(byDependencyOrder)) {
    if (!orderedTaskIds.includes(taskId)) {
      orderedTaskIds.push(taskId)
    }
  }

  return orderedTaskIds
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is TaskEvent => task !== undefined)
}
