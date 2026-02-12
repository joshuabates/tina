import { useEffect, useRef, useState } from "react"
import { Option } from "effect"
import { LoaderCircle, Square, SquareCheck } from "lucide-react"
import { useSelection } from "@/hooks/useSelection"
import { useIndexedAction } from "@/hooks/useIndexedAction"
import { useRovingSection } from "@/hooks/useRovingSection"
import { useActionRegistration } from "@/hooks/useActionRegistration"
import { TaskQuicklook } from "@/components/TaskQuicklook"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import {
  statusTextClass,
  toStatusBadgeStatus,
} from "@/components/ui/status-styles"
import { orderTasksByDependency } from "@/lib/task-dependencies"
import { cn } from "@/lib/utils"
import { formatLocalTimestamp, formatRelativeTimeShort } from "@/lib/time"
import type { OrchestrationDetail } from "@/schemas"
import styles from "./TaskListPanel.module.scss"

interface TaskListPanelProps {
  detail: OrchestrationDetail
}

interface TeamModelIndex {
  exact: Map<string, string>
  normalized: Map<string, string>
}

type TaskStateIndicatorVariant = "complete" | "in_progress" | "pending"

const MODEL_KEYS = ["model", "agentModel", "agent_model", "llmModel", "llm_model"] as const

// Map TaskEvent status to StatusBadgeStatus
function mapTaskStatus(status: string): StatusBadgeStatus {
  return toStatusBadgeStatus(status)
}

function taskStateIndicator(status: StatusBadgeStatus): TaskStateIndicatorVariant {
  switch (status) {
    case "complete":
    case "done":
      return "complete"
    case "executing":
    case "active":
    case "reviewing":
    case "in_progress":
      return "in_progress"
    default:
      return "pending"
  }
}

function taskStateLabel(indicator: TaskStateIndicatorVariant): string {
  switch (indicator) {
    case "complete":
      return "Task complete"
    case "in_progress":
      return "Task in progress"
    default:
      return "Task not complete"
  }
}

function normalizeAgentName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function findModelValue(value: unknown, depth = 0): string | undefined {
  if (depth > 3 || value === null || value === undefined) {
    return undefined
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const model = findModelValue(item, depth + 1)
      if (model) {
        return model
      }
    }
    return undefined
  }

  if (typeof value !== "object") {
    return undefined
  }

  const record = value as Record<string, unknown>

  for (const key of MODEL_KEYS) {
    const candidate = record[key]
    if (typeof candidate === "string") {
      const trimmed = candidate.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  for (const [key, candidate] of Object.entries(record)) {
    if (/model/i.test(key) && typeof candidate === "string") {
      const trimmed = candidate.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  for (const nested of Object.values(record)) {
    const model = findModelValue(nested, depth + 1)
    if (model) {
      return model
    }
  }

  return undefined
}

function modelFromTaskMetadata(metadata: Option.Option<string>): string | undefined {
  const rawMetadata = Option.getOrUndefined(metadata)
  if (!rawMetadata) {
    return undefined
  }

  try {
    const parsed = JSON.parse(rawMetadata) as unknown
    return findModelValue(parsed)
  } catch {
    return undefined
  }
}

function buildTeamModelIndex(detail: OrchestrationDetail): TeamModelIndex {
  const exact = new Map<string, string>()
  const normalized = new Map<string, string>()

  for (const member of detail.teamMembers) {
    const model = Option.getOrUndefined(member.model)
    if (!model) {
      continue
    }

    const agentName = member.agentName.trim()
    if (agentName.length === 0) {
      continue
    }

    exact.set(agentName, model)
    normalized.set(normalizeAgentName(agentName), model)
  }

  return { exact, normalized }
}

function resolveTaskModel(
  owner: string | undefined,
  metadata: Option.Option<string>,
  teamModelIndex: TeamModelIndex,
): string | undefined {
  if (owner) {
    const exactMatch = teamModelIndex.exact.get(owner)
    if (exactMatch) {
      return exactMatch
    }

    const normalizedMatch = teamModelIndex.normalized.get(normalizeAgentName(owner))
    if (normalizedMatch) {
      return normalizedMatch
    }
  }

  return modelFromTaskMetadata(metadata)
}

function TaskStatusIndicator({ status }: { status: StatusBadgeStatus }) {
  const indicator = taskStateIndicator(status)
  const iconClassName = cn(
    "h-4 w-4",
    statusTextClass(status),
    indicator === "pending" && "opacity-70",
  )

  if (indicator === "complete") {
    return (
      <span className={styles.statusIcon} role="img" aria-label={taskStateLabel(indicator)}>
        <SquareCheck className={iconClassName} aria-hidden="true" />
      </span>
    )
  }

  if (indicator === "in_progress") {
    return (
      <span className={styles.statusIcon} role="img" aria-label={taskStateLabel(indicator)}>
        <LoaderCircle className={cn(iconClassName, "animate-spin")} aria-hidden="true" />
      </span>
    )
  }

  return (
    <span className={styles.statusIcon} role="img" aria-label={taskStateLabel(indicator)}>
      <Square className={iconClassName} aria-hidden="true" />
    </span>
  )
}

export function TaskListPanel({ detail }: TaskListPanelProps) {
  const { phaseId } = useSelection()
  const [quicklookTaskId, setQuicklookTaskId] = useState<string | null>(null)
  const [quicklookTracksKeyboardSelection, setQuicklookTracksKeyboardSelection] = useState(true)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const focusedElementRef = useRef<HTMLElement | null>(null)

  // Find the selected phase
  const selectedPhase = phaseId
    ? detail.phases.find((p) => p._id === phaseId)
    : null

  // Get tasks for the selected phase
  const rawTasks = selectedPhase
    ? detail.phaseTasks[selectedPhase.phaseNumber] ?? []
    : []
  const tasks = orderTasksByDependency(rawTasks)
  const teamModelIndex = buildTeamModelIndex(detail)

  // Register focus section with item count
  const { activeIndex, activeDescendantId, getItemProps } = useRovingSection({
    sectionId: "taskList",
    itemCount: tasks.length,
    getItemDomId: (index) => {
      const task = tasks[index]
      return task ? `task-${task._id}` : undefined
    },
  })

  const toggleQuicklookForTask = (taskId: string, openedFromHover: boolean) => {
    if (quicklookTaskId === taskId) {
      // Closing quicklook
      setQuicklookTracksKeyboardSelection(true)
      setQuicklookTaskId(null)
      return
    }

    // Opening quicklook - save current focused element
    focusedElementRef.current = document.activeElement as HTMLElement
    setQuicklookTracksKeyboardSelection(!openedFromHover)
    setQuicklookTaskId(taskId)
  }

  // Register Space key action for quicklook
  useIndexedAction({
    id: "task-list-quicklook",
    label: "View Task Details",
    key: " ",
    when: "taskList",
    items: tasks,
    activeIndex,
    resolveIndex: () => hoveredIndex,
    execute: (task) => {
      toggleQuicklookForTask(task._id, hoveredIndex !== null)
    },
  })

  // Hover fallback: allow Space to quicklook the hovered task even when taskList
  // is not the active keyboard section. This does not retarget focus.
  useActionRegistration({
    id: "task-list-quicklook-hover",
    label: "View Hovered Task Details",
    key: hoveredIndex === null ? undefined : " ",
    execute: () => {
      if (hoveredIndex === null) return
      const hoveredTask = tasks[hoveredIndex]
      if (!hoveredTask) return
      toggleQuicklookForTask(hoveredTask._id, true)
    },
  })

  useEffect(() => {
    if (hoveredIndex === null) return
    if (hoveredIndex >= 0 && hoveredIndex < tasks.length) return
    setHoveredIndex(null)
  }, [hoveredIndex, tasks.length])

  useEffect(() => {
    if (quicklookTaskId === null) return
    if (!quicklookTracksKeyboardSelection) return

    const activeTask = tasks[activeIndex]
    if (!activeTask) return

    if (activeTask._id !== quicklookTaskId) {
      setQuicklookTaskId(activeTask._id)
    }
  }, [quicklookTaskId, quicklookTracksKeyboardSelection, tasks, activeIndex])

  const handleQuicklookClose = () => {
    setQuicklookTracksKeyboardSelection(true)
    setQuicklookTaskId(null)
    // Restore focus to the previously focused task element
    if (focusedElementRef.current) {
      focusedElementRef.current.focus()
      focusedElementRef.current = null
    }
  }

  // Find quicklook task data
  const quicklookTask = quicklookTaskId
    ? tasks.find((t) => t._id === quicklookTaskId)
    : null

  // No phase selected
  if (!phaseId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No phase selected
      </div>
    )
  }

  // Phase selected but no tasks
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No tasks for this phase
      </div>
    )
  }

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.summary}>
            Phase {selectedPhase?.phaseNumber} - {tasks.length} tasks
          </h3>
        </div>

        <div className={styles.tableViewport}>
          <div
            className={styles.table}
            role="grid"
            aria-label="Tasks"
            aria-activedescendant={activeDescendantId}
          >
            <div className={styles.tableBody}>
              {tasks.map((task, index) => {
                const rovingProps = getItemProps(index, `task-${task._id}`)
                const status = mapTaskStatus(task.status)
                const assignee = Option.getOrUndefined(task.owner)
                const model = resolveTaskModel(assignee, task.metadata, teamModelIndex)

                return (
                  <div
                    key={task._id}
                    role="row"
                    data-task-id={task.taskId}
                    className={cn(
                      styles.row,
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[focused=true]:ring-2 data-[focused=true]:bg-primary/5",
                    )}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => {
                      setHoveredIndex((current) => (current === index ? null : current))
                    }}
                    {...rovingProps}
                  >
                    <div className={cn(styles.cell, styles.statusCell)} role="gridcell">
                      <TaskStatusIndicator status={status} />
                    </div>

                    <div className={cn(styles.cell, styles.taskCell)} role="gridcell">
                      <h4 className={styles.subject}>{task.subject}</h4>
                    </div>

                    <div className={cn(styles.cell, styles.ownerCell)} role="gridcell">
                      {assignee ?? <span className={styles.mutedValue}>unassigned</span>}
                    </div>

                    <div className={cn(styles.cell, styles.modelCell)} role="gridcell">
                      {model
                        ? <span className={styles.modelPill}>{model}</span>
                        : <span className={styles.mutedValue}>unknown</span>}
                    </div>

                    <div className={cn(styles.cell, styles.updatedCell)} role="gridcell">
                      <span
                        className={styles.updatedText}
                        title={`Updated ${formatLocalTimestamp(task.recordedAt)}`}
                      >
                        updated {formatRelativeTimeShort(task.recordedAt)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {quicklookTask && (
        <TaskQuicklook task={quicklookTask} onClose={handleQuicklookClose} />
      )}
    </>
  )
}
