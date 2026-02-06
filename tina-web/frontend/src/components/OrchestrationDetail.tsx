import { Link, useParams } from "react-router-dom";
import { useOrchestrationDetail } from "../hooks/useOrchestrationDetail";
import type { Phase } from "../types";
import TaskList from "./TaskList";
import TeamPanel from "./TeamPanel";

function statusBadgeClass(status: string): string {
  const base = "px-2 py-0.5 rounded text-xs font-medium";
  switch (status) {
    case "complete": return `${base} bg-blue-900 text-blue-300`;
    case "executing": return `${base} bg-green-900 text-green-300`;
    case "reviewing": return `${base} bg-yellow-900 text-yellow-300`;
    case "blocked": return `${base} bg-red-900 text-red-300`;
    case "planning": return `${base} bg-cyan-900 text-cyan-300`;
    default: return `${base} bg-gray-800 text-gray-400`;
  }
}

function phaseTiming(phase: Phase): string {
  const parts: string[] = [];
  if (phase.planning_mins != null) parts.push(`plan ${phase.planning_mins}m`);
  if (phase.execution_mins != null) parts.push(`exec ${phase.execution_mins}m`);
  if (phase.review_mins != null) parts.push(`review ${phase.review_mins}m`);
  return parts.join(", ") || "--";
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    // Silently fail if clipboard not available
  });
}

interface Props {
  onUpdate?: (listener: () => void) => () => void;
}

export default function OrchestrationDetail({ onUpdate }: Props) {
  const { id } = useParams<{ id: string }>();
  const { detail, loading, error } = useOrchestrationDetail(id!, onUpdate);

  if (loading) {
    return (
      <div className="p-4">
        <Link to="/" className="text-cyan-400 hover:underline text-sm">&larr; Back</Link>
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-4">
        <Link to="/" className="text-cyan-400 hover:underline text-sm">&larr; Back</Link>
        <p className="mt-4 text-gray-500">{error ?? `Orchestration not found: ${id}`}</p>
      </div>
    );
  }

  const orch = detail.orchestration;

  return (
    <div data-testid="orchestration-detail" className="p-4">
      <Link to="/" className="text-cyan-400 hover:underline text-sm">&larr; Back</Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 data-testid="detail-feature-name" className="text-xl font-semibold">{orch.feature_name}</h1>
          <span data-testid="detail-status-badge" className={statusBadgeClass(orch.status)}>
            {orch.status}
          </span>
        </div>
        <div className="text-sm text-gray-500 mt-1 space-x-4">
          <span data-testid="detail-branch" className="font-mono">{orch.branch}</span>
          <span data-testid="detail-phases">
            {orch.total_phases} phase{orch.total_phases !== 1 ? "s" : ""}
          </span>
          {orch.total_elapsed_mins != null && (
            <span>{orch.total_elapsed_mins}m elapsed</span>
          )}
        </div>
        {orch.worktree_path && (
          <div className="mt-2 flex items-center gap-2">
            <code className="text-xs bg-gray-800 px-2 py-1 rounded font-mono text-gray-300">
              {orch.worktree_path}
            </code>
            <button
              onClick={() => copyToClipboard(orch.worktree_path!)}
              className="text-xs text-gray-500 hover:text-gray-300"
              title="Copy path"
            >
              copy
            </button>
          </div>
        )}
      </div>

      {/* Phase Timeline */}
      {detail.phases.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Phases</h2>
          <div className="space-y-2">
            {detail.phases.map((phase) => (
              <div
                key={phase.phase_number}
                data-testid={`phase-${phase.phase_number}`}
                className="bg-gray-900 rounded-lg px-4 py-3 flex items-center gap-4"
              >
                <span className="font-mono text-gray-400 w-8">{phase.phase_number}</span>
                <span className={statusBadgeClass(phase.status)}>{phase.status}</span>
                <span className="text-sm text-gray-500">{phaseTiming(phase)}</span>
                {phase.git_range && (
                  <code className="text-xs text-gray-600 font-mono">{phase.git_range}</code>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg p-4">
          <TaskList tasks={detail.tasks} title="Tasks" orchestrationId={orch.id} />
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <TeamPanel members={detail.members} />
        </div>
      </div>
    </div>
  );
}
