import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useOrchestrationDetail } from "../hooks/useOrchestrationDetail";
import type { OrchestrationEvent, Phase } from "../types";
import EventTimeline from "./EventTimeline";
import OrchestrationControls from "./OrchestrationControls";
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
  if (phase.planningMins != null) parts.push(`plan ${phase.planningMins}m`);
  if (phase.executionMins != null) parts.push(`exec ${phase.executionMins}m`);
  if (phase.reviewMins != null) parts.push(`review ${phase.reviewMins}m`);
  return parts.join(", ") || "--";
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    // Silently fail if clipboard not available
  });
}

export default function OrchestrationDetail() {
  const { id } = useParams<{ id: string }>();
  const { detail, loading } = useOrchestrationDetail(id!);
  const events = (useQuery(api.events.listEvents, {
    orchestrationId: id as Id<"orchestrations">,
  }) ?? []) as OrchestrationEvent[];

  if (loading) {
    return (
      <div className="p-4">
        <Link to="/" className="text-cyan-400 hover:underline text-sm">&larr; Back</Link>
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-4">
        <Link to="/" className="text-cyan-400 hover:underline text-sm">&larr; Back</Link>
        <p className="mt-4 text-gray-500">Orchestration not found: {id}</p>
      </div>
    );
  }

  return (
    <div data-testid="orchestration-detail" className="p-4">
      <Link to="/" className="text-cyan-400 hover:underline text-sm">&larr; Back</Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 data-testid="detail-feature-name" className="text-xl font-semibold">{detail.featureName}</h1>
          <span data-testid="detail-status-badge" className={statusBadgeClass(detail.status)}>
            {detail.status}
          </span>
          <OrchestrationControls
            orchestrationId={detail._id}
            nodeId={detail.nodeId}
            status={detail.status}
            phases={detail.phases}
          />
        </div>
        <div className="text-sm text-gray-500 mt-1 space-x-4">
          <span data-testid="detail-branch" className="font-mono">{detail.branch}</span>
          <span data-testid="detail-phases">
            {detail.totalPhases} phase{detail.totalPhases !== 1 ? "s" : ""}
          </span>
          {detail.totalElapsedMins != null && (
            <span>{detail.totalElapsedMins}m elapsed</span>
          )}
        </div>
        {detail.worktreePath && (
          <div className="mt-2 flex items-center gap-2">
            <code className="text-xs bg-gray-800 px-2 py-1 rounded font-mono text-gray-300">
              {detail.worktreePath}
            </code>
            <button
              onClick={() => copyToClipboard(detail.worktreePath!)}
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
                key={phase.phaseNumber}
                data-testid={`phase-${phase.phaseNumber}`}
                className="bg-gray-900 rounded-lg px-4 py-3 flex items-center gap-4"
              >
                <span className="font-mono text-gray-400 w-8">{phase.phaseNumber}</span>
                <span className={statusBadgeClass(phase.status)}>{phase.status}</span>
                <span className="text-sm text-gray-500">{phaseTiming(phase)}</span>
                {phase.gitRange && (
                  <code className="text-xs text-gray-600 font-mono">{phase.gitRange}</code>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orchestrator Tasks */}
      {detail.orchestratorTasks.length > 0 && (
        <div className="mb-6 bg-gray-900 rounded-lg p-4">
          <TaskList tasks={detail.orchestratorTasks} title="Orchestrator Tasks" orchestrationId={detail._id} />
          {detail.teamMembers.filter((m) => !m.phaseNumber || m.phaseNumber === "0").length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-1">Team</p>
              <div className="flex flex-wrap gap-2">
                {detail.teamMembers
                  .filter((m) => !m.phaseNumber || m.phaseNumber === "0")
                  .map((m) => (
                    <span key={m.agentName} className="text-sm text-gray-300">
                      {m.agentName}
                      {m.agentType && <span className="text-gray-500 ml-1">{m.agentType}</span>}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-Phase Sections */}
      {detail.phases.map((phase) => {
        const phaseTasks = detail.phaseTasks[phase.phaseNumber] ?? [];
        const phaseMembers = detail.teamMembers.filter((m) => m.phaseNumber === phase.phaseNumber);
        return (
          <div key={phase.phaseNumber} className="mb-6 bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-300">Phase {phase.phaseNumber}</h2>
              <span className={statusBadgeClass(phase.status)}>{phase.status}</span>
              <span className="text-xs text-gray-500">{phaseTiming(phase)}</span>
            </div>
            <TaskList tasks={phaseTasks} title={`Phase ${phase.phaseNumber} Tasks`} orchestrationId={detail._id} />
            {phaseMembers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-1">Team</p>
                <div className="flex flex-wrap gap-2">
                  {phaseMembers.map((m) => (
                    <span key={m.agentName} className="text-sm text-gray-300">
                      {m.agentName}
                      {m.agentType && <span className="text-gray-500 ml-1">{m.agentType}</span>}
                      {m.model && <span className="text-gray-600 ml-1">{m.model.includes("opus") ? "opus" : m.model.includes("sonnet") ? "sonnet" : m.model.includes("haiku") ? "haiku" : m.model}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* All Team Members (collapsed fallback) */}
      {detail.phases.length === 0 && detail.teamMembers.length > 0 && (
        <div className="mb-6 bg-gray-900 rounded-lg p-4">
          <TeamPanel members={detail.teamMembers} />
        </div>
      )}

      {/* Flat task fallback when no phases exist */}
      {detail.phases.length === 0 && detail.orchestratorTasks.length === 0 && detail.tasks.length > 0 && (
        <div className="mb-6 bg-gray-900 rounded-lg p-4">
          <TaskList tasks={detail.tasks} title="Tasks" orchestrationId={detail._id} />
        </div>
      )}

      {/* Event Log */}
      <div className="mt-6 bg-gray-900 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Event Log</h2>
        <EventTimeline events={events} />
      </div>
    </div>
  );
}
