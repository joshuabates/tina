import { Option } from "effect"
import { useFocusable } from "@/hooks/useFocusable"
import { useSelection } from "@/hooks/useSelection"
import { useActionRegistration } from "@/hooks/useActionRegistration"
import { TaskCard } from "@/components/ui/task-card"
import type { StatusBadgeStatus } from "@/components/ui/status-badge"
import type { OrchestrationDetail } from "@/schemas"

interface TaskListPanelProps {
  detail: OrchestrationDetail
}

// Map TaskEvent status to StatusBadgeStatus
// Pass status as-is (lowercase) - StatusBadge will display the text correctly
// and use fallback styling if status doesn't match a variant
function mapTaskStatus(status: string): StatusBadgeStatus {
  return status.toLowerCase() as StatusBadgeStatus
}

export function TaskListPanel({ detail }: TaskListPanelProps) {
  const { phaseId } = useSelection()

  // Find the selected phase
  const selectedPhase = phaseId
    ? detail.phases.find((p) => p._id === phaseId)
    : null

  // Get tasks for the selected phase
  const tasks = selectedPhase
    ? detail.phaseTasks[selectedPhase.phaseNumber] ?? []
    : []

  // Register focus section with item count
  const { isSectionFocused, activeIndex } = useFocusable("taskList", tasks.length)

  // Register Space key action for quicklook
  useActionRegistration({
    id: "task-list-quicklook",
    label: "View Task Details",
    key: " ",
    when: "taskList",
    execute: () => {
      // TODO: Wire quicklook in Task 5
    },
  })

  // Calculate aria-activedescendant
  const activeDescendantId =
    isSectionFocused && activeIndex >= 0 && activeIndex < tasks.length
      ? `task-${tasks[activeIndex]._id}`
      : undefined

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
        aria-activedescendant={activeDescendantId}
      >
        {tasks.map((task, index) => {
          const isFocused = isSectionFocused && activeIndex === index
          const tabIndex = isFocused ? 0 : -1

          return (
            <TaskCard
              key={task._id}
              id={`task-${task._id}`}
              taskId={task.taskId}
              subject={task.subject}
              status={mapTaskStatus(task.status)}
              assignee={Option.getOrUndefined(task.owner)}
              blockedReason={Option.getOrUndefined(task.blockedBy)}
              tabIndex={tabIndex}
              data-focused={isFocused ? "true" : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
