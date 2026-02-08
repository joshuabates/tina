import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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

function parseJsonOrNull(json: string | undefined): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function TaskDetail() {
  const { id: orchestrationId, taskId } = useParams<{ id: string; taskId: string }>();
  const events = (useQuery(api.tasks.listTaskEvents, {
    orchestrationId: orchestrationId as Id<"orchestrations">,
    taskId: taskId!,
  }) ?? undefined) as TaskEvent[] | undefined;

  const loading = events === undefined;

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

  if (events.length === 0) {
    return (
      <div className="p-4">
        <Link to={`/orchestrations/${encodeURIComponent(orchestrationId!)}`} className="text-cyan-400 hover:underline text-sm">
          &larr; Back to orchestration
        </Link>
        <p className="mt-4 text-gray-500">Task not found</p>
      </div>
    );
  }

  const current = events[events.length - 1];
  const blockedBy = parseJsonOrNull(current.blockedBy) as string[] | null;
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
          {current.phaseNumber && <span>Phase {current.phaseNumber}</span>}
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
          {events.map((event) => (
            <li key={event._id} className="flex items-start gap-3 text-sm">
              <span className="text-gray-600 text-xs whitespace-nowrap mt-0.5">
                {formatTime(event.recordedAt)}
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
