import { useState, useCallback } from "react"
import { useQuery, useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { generateIdempotencyKey } from "@/lib/utils"
import { StatPanel } from "@/components/ui/stat-panel"
import { MonoText } from "@/components/ui/mono-text"

const MODEL_OPTIONS = ["opus", "sonnet", "haiku"] as const

interface PendingTaskEditorProps {
  orchestrationId: string
  nodeId: string
  featureName: string
  phaseNumber: string
}

export function PendingTaskEditor({
  orchestrationId,
  nodeId,
  featureName,
  phaseNumber,
}: PendingTaskEditorProps) {
  const tasks = useQuery(api.executionTasks.listExecutionTasks, {
    orchestrationId: orchestrationId as Id<"orchestrations">,
    phaseNumber,
  })

  const enqueueAction = useMutation(api.controlPlane.enqueueControlAction)
  const [pendingTaskNum, setPendingTaskNum] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Insert form state
  const [insertSubject, setInsertSubject] = useState("")
  const [insertModel, setInsertModel] = useState<string>("opus")
  const [insertAfterTask, setInsertAfterTask] = useState<number>(0)

  const handleModelChange = useCallback(
    async (taskNumber: number, revision: number, newModel: string) => {
      setPendingTaskNum(taskNumber)
      setError(null)
      setSuccess(null)

      try {
        await enqueueAction({
          orchestrationId: orchestrationId as Id<"orchestrations">,
          nodeId: nodeId as Id<"nodes">,
          actionType: "task_set_model",
          payload: JSON.stringify({
            feature: featureName,
            phaseNumber,
            taskNumber,
            revision,
            model: newModel,
          }),
          requestedBy: "web-ui",
          idempotencyKey: generateIdempotencyKey(),
        })
        setSuccess(`Task #${taskNumber} → ${newModel}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed")
      } finally {
        setPendingTaskNum(null)
      }
    },
    [enqueueAction, orchestrationId, nodeId, featureName, phaseNumber],
  )

  const handleInsert = useCallback(async () => {
    if (!insertSubject.trim()) return

    setPendingTaskNum(-1)
    setError(null)
    setSuccess(null)

    try {
      await enqueueAction({
        orchestrationId: orchestrationId as Id<"orchestrations">,
        nodeId: nodeId as Id<"nodes">,
        actionType: "task_insert",
        payload: JSON.stringify({
          feature: featureName,
          phaseNumber,
          afterTask: insertAfterTask,
          subject: insertSubject.trim(),
          model: insertModel,
        }),
        requestedBy: "web-ui",
        idempotencyKey: generateIdempotencyKey(),
      })
      setInsertSubject("")
      setSuccess("Task inserted")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insert failed")
    } finally {
      setPendingTaskNum(null)
    }
  }, [
    enqueueAction,
    orchestrationId,
    nodeId,
    featureName,
    phaseNumber,
    insertSubject,
    insertModel,
    insertAfterTask,
  ])

  if (tasks === null || tasks === undefined) {
    return (
      <StatPanel title="Tasks">
        <MonoText className="text-[8px] text-muted-foreground">Loading...</MonoText>
      </StatPanel>
    )
  }

  if (tasks.length === 0) {
    return (
      <StatPanel title="Tasks">
        <MonoText className="text-[8px] text-muted-foreground">
          No tasks for this phase
        </MonoText>
      </StatPanel>
    )
  }

  const pendingCount = tasks.filter((t) => t.status === "pending").length

  const selectClass =
    "flex-1 text-[8px] bg-muted/45 border border-border/70 rounded px-1.5 py-0.5 text-foreground"
  const inputClass =
    "w-full text-[8px] bg-muted/45 border border-border/70 rounded px-1.5 py-0.5 text-foreground"
  const btnClass =
    "w-full flex items-center justify-center gap-1 px-1.5 py-1 text-[8px] font-semibold uppercase tracking-tight bg-muted/45 hover:bg-muted/70 border border-border/70 rounded transition-colors text-foreground disabled:opacity-40 disabled:pointer-events-none"

  return (
    <StatPanel title="Tasks">
      <div className="space-y-2">
        <MonoText className="text-[7px] text-muted-foreground/70 uppercase tracking-wider">
          Phase {phaseNumber} — {tasks.length} tasks ({pendingCount} editable)
        </MonoText>

        {error && (
          <div className="text-[7px] text-status-blocked truncate" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="text-[7px] text-emerald-400 truncate" role="status">
            {success}
          </div>
        )}

        <div className="space-y-1.5">
          {tasks.map((task) => (
            <div key={task._id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <MonoText className="text-[8px] text-muted-foreground shrink-0">
                  #{task.taskNumber}
                </MonoText>
                {task.insertedBy && (
                  <span
                    className="text-[8px] text-emerald-400 shrink-0"
                    data-testid={`inserted-indicator-${task.taskNumber}`}
                  >
                    +
                  </span>
                )}
                <MonoText className="text-[8px] text-foreground truncate">
                  {task.subject}
                </MonoText>
              </div>

              {task.status === "pending" ? (
                <select
                  className={selectClass}
                  value={task.model ?? "opus"}
                  onChange={(e) =>
                    handleModelChange(task.taskNumber, task.revision, e.target.value)
                  }
                  disabled={pendingTaskNum !== null}
                  data-testid={`task-model-${task.taskNumber}`}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <MonoText className="text-[8px] text-muted-foreground shrink-0">
                  {task.status}
                </MonoText>
              )}
            </div>
          ))}
        </div>

        {/* Insert task form */}
        <div className="border-t border-border/50 pt-2 space-y-1.5">
          <MonoText className="text-[7px] text-muted-foreground/70 uppercase tracking-wider">
            Insert Task
          </MonoText>
          <input
            className={inputClass}
            type="text"
            placeholder="Task subject"
            value={insertSubject}
            onChange={(e) => setInsertSubject(e.target.value)}
            data-testid="insert-task-subject"
          />
          <div className="flex gap-1.5">
            <select
              className={selectClass}
              value={insertModel}
              onChange={(e) => setInsertModel(e.target.value)}
              data-testid="insert-task-model"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={insertAfterTask}
              onChange={(e) => setInsertAfterTask(Number(e.target.value))}
              data-testid="insert-task-after"
            >
              <option value={0}>Beginning</option>
              {tasks.map((t) => (
                <option key={t.taskNumber} value={t.taskNumber}>
                  After #{t.taskNumber}
                </option>
              ))}
            </select>
          </div>
          <button
            className={btnClass}
            disabled={pendingTaskNum !== null || !insertSubject.trim()}
            onClick={handleInsert}
            data-testid="insert-task-submit"
          >
            {pendingTaskNum === -1 ? "..." : "Insert"}
          </button>
        </div>

        {pendingTaskNum !== null && pendingTaskNum >= 0 && (
          <MonoText className="text-[7px] text-muted-foreground animate-pulse">
            Updating task #{pendingTaskNum}...
          </MonoText>
        )}
      </div>
    </StatPanel>
  )
}
