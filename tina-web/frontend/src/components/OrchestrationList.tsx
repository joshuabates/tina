import { Link } from "react-router-dom";
import type { Orchestration, OrchestrationStatus } from "../types";

function statusLabel(status: OrchestrationStatus): string {
  if (status === "complete") return "Complete";
  if (status === "idle") return "Idle";
  if (typeof status === "object") {
    if ("executing" in status) return `Executing (phase ${status.executing.phase})`;
    if ("blocked" in status) return `Blocked (phase ${status.blocked.phase})`;
  }
  return "Unknown";
}

function statusColor(status: OrchestrationStatus): string {
  if (status === "complete") return "text-blue-400";
  if (status === "idle") return "text-gray-500";
  if (typeof status === "object") {
    if ("executing" in status) return "text-green-400";
    if ("blocked" in status) return "text-red-400";
  }
  return "text-gray-400";
}

function taskProgress(orch: Orchestration): string {
  const completed = orch.tasks.filter((t) => t.status === "completed").length;
  return `${completed}/${orch.tasks.length}`;
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
            <th className="pb-2 pr-4">Team</th>
            <th className="pb-2 pr-4">Feature</th>
            <th className="pb-2 pr-4">Phase</th>
            <th className="pb-2 pr-4">Tasks</th>
            <th className="pb-2 pr-4">Context</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {orchestrations.map((orch) => (
            <tr
              key={orch.team_name}
              data-testid={`orchestration-row-${orch.team_name}`}
              className="border-b border-gray-900 hover:bg-gray-900/50"
            >
              <td data-testid="orchestration-team-name" className="py-2 pr-4">
                <Link
                  to={`/orchestration/${encodeURIComponent(orch.team_name)}`}
                  className="text-cyan-400 hover:underline"
                >
                  {orch.team_name}
                </Link>
              </td>
              <td data-testid="orchestration-feature" className="py-2 pr-4">{orch.feature_name}</td>
              <td data-testid="orchestration-phase" className="py-2 pr-4 font-mono">
                {orch.current_phase}/{orch.total_phases}
              </td>
              <td data-testid="orchestration-tasks" className="py-2 pr-4 font-mono">{taskProgress(orch)}</td>
              <td className="py-2 pr-4 font-mono">
                {orch.context_percent != null ? `${orch.context_percent}%` : "--"}
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
