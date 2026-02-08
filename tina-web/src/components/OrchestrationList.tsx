import { Link } from "react-router-dom";
import type { Orchestration } from "../types";

function statusLabel(status: string): string {
  switch (status) {
    case "complete": return "Complete";
    case "planning": return "Planning";
    case "executing": return "Executing";
    case "reviewing": return "Reviewing";
    case "blocked": return "Blocked";
    default: return status;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "complete": return "text-blue-400";
    case "executing": return "text-green-400";
    case "reviewing": return "text-yellow-400";
    case "blocked": return "text-red-400";
    case "planning": return "text-cyan-400";
    default: return "text-gray-400";
  }
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(orch: Orchestration): string {
  if (orch.totalElapsedMins != null) {
    return `${orch.totalElapsedMins}m`;
  }
  if (orch.status !== "complete" && orch.completedAt == null) {
    const mins = Math.floor((Date.now() - new Date(orch.startedAt).getTime()) / 60_000);
    return `${mins}m`;
  }
  return "--";
}

interface Props {
  orchestrations: Orchestration[];
}

export default function OrchestrationList({ orchestrations }: Props) {
  if (orchestrations.length === 0) {
    return (
      <div data-testid="empty-state" className="flex items-center justify-center h-64 text-gray-500">
        No orchestrations found
      </div>
    );
  }

  return (
    <div data-testid="orchestration-list" className="p-4">
      <h1 className="text-xl font-semibold mb-4">Orchestrations</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-left">
            <th className="pb-2 pr-4">Feature</th>
            <th className="pb-2 pr-4">Branch</th>
            <th className="pb-2 pr-4">Phases</th>
            <th className="pb-2 pr-4">Started</th>
            <th className="pb-2 pr-4">Duration</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {orchestrations.map((orch) => (
            <tr
              key={orch._id}
              data-testid={`orchestration-row-${orch._id}`}
              className="border-b border-gray-900 hover:bg-gray-900/50"
            >
              <td data-testid="orchestration-feature" className="py-2 pr-4">
                <Link
                  to={`/orchestrations/${encodeURIComponent(orch._id)}`}
                  className="text-cyan-400 hover:underline"
                >
                  {orch.featureName}
                </Link>
              </td>
              <td data-testid="orchestration-branch" className="py-2 pr-4 font-mono text-gray-400">
                {orch.branch}
              </td>
              <td data-testid="orchestration-phases" className="py-2 pr-4 font-mono">
                {orch.totalPhases}
              </td>
              <td data-testid="orchestration-started" className="py-2 pr-4 text-gray-400">
                {relativeTime(orch.startedAt)}
              </td>
              <td data-testid="orchestration-duration" className="py-2 pr-4 font-mono">
                {formatDuration(orch)}
              </td>
              <td data-testid="orchestration-status" className={`py-2 ${statusColor(orch.status)}`}>
                {statusLabel(orch.status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
