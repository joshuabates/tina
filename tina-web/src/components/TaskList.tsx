import { Link } from "react-router-dom";
import type { TaskEvent } from "../types";

function statusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[>]";
    case "pending":
      return "[ ]";
    default:
      return "[?]";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-400";
    case "in_progress":
      return "text-yellow-400";
    case "pending":
      return "text-gray-500";
    default:
      return "text-gray-500";
  }
}

interface Props {
  tasks: TaskEvent[];
  title?: string;
  orchestrationId?: string;
}

export default function TaskList({ tasks, title = "Tasks", orchestrationId }: Props) {
  return (
    <div data-testid={`task-list-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <h3 className="text-sm font-semibold text-gray-400 mb-2">{title}</h3>
      {tasks.length === 0 ? (
        <p className="text-gray-600 text-sm">No tasks</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.taskId} data-testid={`task-${task.taskId}`} className="flex items-start gap-2 text-sm">
              <span data-testid="task-status" className={`font-mono ${statusColor(task.status)}`}>
                {statusIcon(task.status)}
              </span>
              <div className="flex-1 min-w-0">
                {orchestrationId ? (
                  <Link
                    to={`/orchestrations/${encodeURIComponent(orchestrationId)}/tasks/${encodeURIComponent(task.taskId)}`}
                    className="hover:underline"
                  >
                    <span data-testid="task-subject">{task.subject}</span>
                  </Link>
                ) : (
                  <span data-testid="task-subject">{task.subject}</span>
                )}
                {task.owner && (
                  <span className="text-cyan-400 ml-2">
                    &larr; {task.owner}
                  </span>
                )}
                {task.blockedBy && (
                  <span className="text-red-400 ml-2">(blocked)</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
