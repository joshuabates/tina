import { Option } from "effect"
import type { TaskEvent } from "@/schemas"

const COMPLETED_STATUSES = new Set(["completed", "complete", "done"])

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase()
}

function isDependencyToken(token: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(token)
}

export function isTaskCompleted(status: string): boolean {
  return COMPLETED_STATUSES.has(normalizeStatus(status))
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
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
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

  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  const taskIds = Array.from(taskById.keys())

  for (const taskId of taskIds) {
    indegree.set(taskId, 0)
    dependents.set(taskId, [])
  }

  for (const task of taskById.values()) {
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

  const byOriginalOrder = (a: string, b: string) =>
    (indexByTaskId.get(a) ?? Number.MAX_SAFE_INTEGER) -
    (indexByTaskId.get(b) ?? Number.MAX_SAFE_INTEGER)

  const ready: string[] = taskIds
    .filter((taskId) => (indegree.get(taskId) ?? 0) === 0)
    .sort(byOriginalOrder)

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
        ready.sort(byOriginalOrder)
      }
    }
  }

  // Cycles or malformed dependency graphs fall back to original order.
  for (const taskId of taskIds.sort(byOriginalOrder)) {
    if (!orderedTaskIds.includes(taskId)) {
      orderedTaskIds.push(taskId)
    }
  }

  const orderedTasks = orderedTaskIds
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is TaskEvent => task !== undefined)

  const incompleteTasks = orderedTasks.filter((task) => !isTaskCompleted(task.status))
  const completedTasks = orderedTasks.filter((task) => isTaskCompleted(task.status))

  return [...incompleteTasks, ...completedTasks]
}
