import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Phase } from "../types";

interface Props {
  orchestrationId: Id<"orchestrations">;
  nodeId: Id<"nodes">;
  status: string;
  phases: Phase[];
}

export default function OrchestrationControls({ orchestrationId, nodeId, status, phases }: Props) {
  const [loading, setLoading] = useState(false);
  const submitAction = useMutation(api.actions.submitAction);

  const canPause = ["executing", "planning", "reviewing"].includes(status);
  const canResume = status === "blocked";
  const blockedPhases = phases.filter((p) => p.status === "blocked");

  async function handlePause() {
    if (!confirm("Pause this orchestration? This will block the current phase.")) return;
    setLoading(true);
    try {
      await submitAction({ nodeId, orchestrationId, type: "pause", payload: "{}" });
    } catch {
      // Silently handle - Convex subscription will update the view
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    setLoading(true);
    try {
      await submitAction({ nodeId, orchestrationId, type: "resume", payload: "{}" });
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry(phase: string) {
    setLoading(true);
    try {
      await submitAction({ nodeId, orchestrationId, type: "retry", payload: JSON.stringify({ phase }) });
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }

  if (!canPause && !canResume && blockedPhases.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canPause && (
        <button
          onClick={handlePause}
          disabled={loading}
          className="px-3 py-1 text-xs rounded bg-yellow-800 text-yellow-200 hover:bg-yellow-700 disabled:opacity-50"
        >
          Pause
        </button>
      )}
      {canResume && (
        <button
          onClick={handleResume}
          disabled={loading}
          className="px-3 py-1 text-xs rounded bg-green-800 text-green-200 hover:bg-green-700 disabled:opacity-50"
        >
          Resume
        </button>
      )}
      {blockedPhases.map((phase) => (
        <button
          key={phase.phaseNumber}
          onClick={() => handleRetry(phase.phaseNumber)}
          disabled={loading}
          className="px-3 py-1 text-xs rounded bg-red-800 text-red-200 hover:bg-red-700 disabled:opacity-50"
        >
          Retry phase {phase.phaseNumber}
        </button>
      ))}
    </div>
  );
}
