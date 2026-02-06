import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchTaskEvents } from "../api";
import type { TaskEvent } from "../types";

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "text-green-400";
    case "in_progress": return "text-yellow-400";
    case "pending": return "text-gray-500";
    default: return "text-gray-400";
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function parseJsonOrNull(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function TaskDetail() {
  const { id: orchestrationId, taskId } = useParams<{ id: string; taskId: string }>();
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orchestrationId || !taskId) return;
    setLoading(true);
    fetchTaskEvents(orchestrationId, taskId)
      .then((data) => {
        setEvents(data);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [orchestrationId, taskId]);

  if (loading) {
    return (
      <div className="p-4">
        <Link to={`/orchestrations/${encodeURIComponent(orchestrationId!)}`} className="text-cyan-400 hover:underline text-sm">
          &larr; Back to orchestration
        </Link>
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error || events.length === 0) {
    return (
      <div className="p-4">
        <Link to={`/orchestrations/${encodeURIComponent(orchestrationId!)}`} className="text-cyan-400 hover:underline text-sm">
          &larr; Back to orchestration
        </Link>
        <p className="mt-4 text-gray-500">{error ?? "Task not found"}</p>
      </div>
    );
  }

  const current = events[events.length - 1];
  const blockedBy = parseJsonOrNull(current.blocked_by) as string[] | null;
  const metadata = parseJsonOrNull(current.metadata) as Record<string, unknown> | null;

  return (
    <div data-testid="task-detail" className="p-4">
      <Link to={`/orchestrations/${encodeURIComponent(orchestrationId!)}`} className="text-cyan-400 hover:underline text-sm">
        &larr; Back to orchestration
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <h1 className="text-xl font-semibold">{current.subject}</h1>
        <div className="text-sm text-gray-500 mt-1 space-x-4">
          <span className={statusColor(current.status)}>{current.status}</span>
          {current.owner && <span>Owner: <span className="text-cyan-400">{current.owner}</span></span>}
          {current.phase_number && <span>Phase {current.phase_number}</span>}
        </div>
      </div>

      {/* Description */}
      {current.description != null && (
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Description</h3>
          <p className="text-sm whitespace-pre-wrap">{current.description}</p>
        </div>
      )}

      {/* Blocking relationships */}
      {blockedBy != null && blockedBy.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Blocked By</h3>
          <ul className="text-sm space-y-1">
            {blockedBy.map((dep) => (
              <li key={dep} className="text-red-400 font-mono">{dep}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata */}
      {metadata != null && (
        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Metadata</h3>
          <dl className="text-sm space-y-1">
            {Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <dt className="text-gray-500 font-mono">{key}:</dt>
                <dd className="text-gray-300">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Event Log */}
      <div data-testid="event-log" className="bg-gray-900 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-400 mb-3">Event Log</h3>
        <ul className="space-y-2">
          {events.map((event, i) => (
            <li key={event.id ?? i} className="flex items-start gap-3 text-sm">
              <span className="text-gray-600 text-xs whitespace-nowrap mt-0.5">
                {formatTime(event.recorded_at)}
              </span>
              <span className={`font-mono ${statusColor(event.status)}`}>
                {event.status}
              </span>
              {event.owner && (
                <span className="text-gray-500">
                  owner: <span className="text-cyan-400">{event.owner}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
