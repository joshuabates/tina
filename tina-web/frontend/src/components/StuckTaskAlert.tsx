import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchStuckTasks } from "../api";
import type { StuckTask } from "../types";

export default function StuckTaskAlert() {
  const [stuckTasks, setStuckTasks] = useState<StuckTask[]>([]);

  const load = useCallback(() => {
    fetchStuckTasks()
      .then(setStuckTasks)
      .catch(() => setStuckTasks([]));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (stuckTasks.length === 0) return null;

  return (
    <div className="bg-yellow-900/50 border border-yellow-700 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-yellow-300 mb-2">
        {stuckTasks.length} stuck task{stuckTasks.length !== 1 ? "s" : ""} detected
      </h3>
      <ul className="space-y-1">
        {stuckTasks.map((task) => (
          <li key={`${task.orchestration_id}-${task.task_id}`} className="text-sm text-yellow-200">
            <Link
              to={`/orchestrations/${encodeURIComponent(task.orchestration_id)}`}
              className="hover:underline"
            >
              {task.subject}
            </Link>
            <span className="text-yellow-400 ml-2">
              {task.owner && `(${task.owner}) `}
              {task.stuck_minutes}m stuck
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
