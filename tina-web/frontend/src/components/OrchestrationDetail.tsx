import { Link, useParams } from "react-router-dom";
import type { Orchestration, OrchestrationStatus } from "../types";
import TaskList from "./TaskList";
import TeamPanel from "./TeamPanel";

function statusLabel(status: OrchestrationStatus): string {
  if (status === "complete") return "Complete";
  if (status === "idle") return "Idle";
  if (typeof status === "object") {
    if ("executing" in status) return "Executing";
    if ("blocked" in status) return "Blocked";
  }
  return "Unknown";
}

function statusBadgeClass(status: OrchestrationStatus): string {
  const base = "px-2 py-0.5 rounded text-xs font-medium";
  if (status === "complete") return `${base} bg-blue-900 text-blue-300`;
  if (status === "idle") return `${base} bg-gray-800 text-gray-400`;
  if (typeof status === "object") {
    if ("executing" in status) return `${base} bg-green-900 text-green-300`;
    if ("blocked" in status) return `${base} bg-red-900 text-red-300`;
  }
  return `${base} bg-gray-800 text-gray-400`;
}

interface Props {
  orchestrations: Orchestration[];
}

export default function OrchestrationDetail({ orchestrations }: Props) {
  const { id } = useParams<{ id: string }>();
  const orch = orchestrations.find((o) => o.team_name === id);

  if (!orch) {
    return (
      <div className="p-4">
        <Link to="/" className="text-cyan-400 hover:underline text-sm">
          &larr; Back
        </Link>
        <p className="mt-4 text-gray-500">Orchestration not found: {id}</p>
      </div>
    );
  }

  return (
    <div data-testid="orchestration-detail" className="p-4">
      <Link to="/" className="text-cyan-400 hover:underline text-sm">
        &larr; Back
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 data-testid="detail-feature-name" className="text-xl font-semibold">{orch.feature_name}</h1>
          <span data-testid="detail-status-badge" className={statusBadgeClass(orch.status)}>
            {statusLabel(orch.status)}
          </span>
        </div>
        <div className="text-sm text-gray-500 mt-1 space-x-4">
          <span data-testid="detail-team-name">Team: {orch.team_name}</span>
          <span data-testid="detail-phase">
            Phase: {orch.current_phase}/{orch.total_phases}
          </span>
          {orch.context_percent != null && (
            <span>Context: {orch.context_percent}%</span>
          )}
        </div>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg p-4">
          <TaskList tasks={orch.tasks} title="Phase Tasks" />
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <TeamPanel members={orch.members} />
        </div>
        <div className="bg-gray-900 rounded-lg p-4 md:col-span-2">
          <TaskList tasks={orch.orchestrator_tasks} title="Orchestrator Tasks" />
        </div>
      </div>
    </div>
  );
}
