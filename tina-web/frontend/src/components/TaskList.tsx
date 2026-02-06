import type { Task } from "../types";

function statusIcon(status: Task["status"]): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[>]";
    case "pending":
      return "[ ]";
  }
}

function statusColor(status: Task["status"]): string {
  switch (status) {
    case "completed":
      return "text-green-400";
    case "in_progress":
      return "text-yellow-400";
    case "pending":
      return "text-gray-500";
  }
}

interface Props {
  tasks: Task[];
  title?: string;
}

export default function TaskList({ tasks, title = "Tasks" }: Props) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 mb-2">{title}</h3>
      {tasks.length === 0 ? (
        <p className="text-gray-600 text-sm">No tasks</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2 text-sm">
              <span className={`font-mono ${statusColor(task.status)}`}>
                {statusIcon(task.status)}
              </span>
              <div className="flex-1 min-w-0">
                <span>{task.subject}</span>
                {task.owner && (
                  <span className="text-cyan-400 ml-2">
                    &larr; {task.owner}
                  </span>
                )}
                {task.blockedBy.length > 0 && (
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
