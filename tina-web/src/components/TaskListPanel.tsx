import { useEffect, useState, useRef } from "react"
import { Option } from "effect"
import { useSelection } from "@/hooks/useSelection"
import { useIndexedAction } from "@/hooks/useIndexedAction"
import { useRovingSection } from "@/hooks/useRovingSection"
import { TaskCard } from "@/components/ui/task-card"
import { TaskQuicklook } from "@/components/TaskQuicklook"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import type { OrchestrationDetail } from "@/schemas"

interface TaskListPanelProps {
  detail: OrchestrationDetail
}

// Map TaskEvent status to StatusBadgeStatus
// Pass status as-is (lowercase) - StatusBadge will display the text correctly
// and use fallback styling if status doesn't match a variant
function mapTaskStatus(status: string): StatusBadgeStatus {
  return toStatusBadgeStatus(status)
}

export function TaskListPanel({ detail }: TaskListPanelProps) {
  const { phaseId } = useSelection()
  const [quicklookTaskId, setQuicklookTaskId] = useState<string | null>(null)
  const focusedElementRef = useRef<HTMLElement | null>(null)

  // Find the selected phase
  const selectedPhase = phaseId
    ? detail.phases.find((p) => p._id === phaseId)
    : null

  // Get tasks for the selected phase
  const tasks = selectedPhase
    ? detail.phaseTasks[selectedPhase.phaseNumber] ?? []
    : []

  // Register focus section with item count
  const { activeIndex, activeDescendantId, getItemProps } = useRovingSection({
    sectionId: "taskList",
    itemCount: tasks.length,
    getItemDomId: (index) => {
      const task = tasks[index]
      return task ? `task-${task._id}` : undefined
    },
  })

  // Register Space key action for quicklook
  useIndexedAction({
    id: "task-list-quicklook",
    label: "View Task Details",
    key: " ",
    when: "taskList",
    items: tasks,
    activeIndex,
    execute: (task) => {
      if (quicklookTaskId === task._id) {
        // Closing quicklook
        setQuicklookTaskId(null)
      } else {
        // Opening quicklook - save current focused element
        focusedElementRef.current = document.activeElement as HTMLElement
        setQuicklookTaskId(task._id)
      }
    },
  })

  useEffect(() => {
    if (quicklookTaskId === null) return

    const activeTask = tasks[activeIndex]
    if (!activeTask) return

    if (activeTask._id !== quicklookTaskId) {
      setQuicklookTaskId(activeTask._id)
    }
  }, [quicklookTaskId, tasks, activeIndex])

  const handleQuicklookClose = () => {
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
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">
            Phase {selectedPhase?.phaseNumber} - {tasks.length} tasks
          </h3>
        </div>

        {/* Task list */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-2"
          role="list"
          aria-label="Tasks"
          aria-activedescendant={activeDescendantId}
        >
          {tasks.map((task, index) => {
            const rovingProps = getItemProps(index, `task-${task._id}`)

            return (
              <TaskCard
                key={task._id}
                taskId={task.taskId}
                subject={task.subject}
                status={mapTaskStatus(task.status)}
                assignee={Option.getOrUndefined(task.owner)}
                blockedReason={Option.getOrUndefined(task.blockedBy)}
                {...rovingProps}
              />
            )
          })}
        </div>
      </div>
      {quicklookTask && (
        <TaskQuicklook task={quicklookTask} onClose={handleQuicklookClose} />
      )}
    </>
  )
}
