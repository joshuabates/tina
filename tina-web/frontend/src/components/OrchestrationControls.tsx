import { useState } from "react";
import { pauseOrchestration, resumeOrchestration, retryPhase } from "../api";
import type { Phase } from "../types";

interface Props {
  orchestrationId: string;
  status: string;
  phases: Phase[];
  onAction: () => void;
}

export default function OrchestrationControls({ orchestrationId, status, phases, onAction }: Props) {
  const [loading, setLoading] = useState(false);

  const canPause = ["executing", "planning", "reviewing"].includes(status);
  const canResume = status === "blocked";
  const blockedPhases = phases.filter((p) => p.status === "blocked");

  async function handlePause() {
    if (!confirm("Pause this orchestration? This will block the current phase.")) return;
    setLoading(true);
    try {
      await pauseOrchestration(orchestrationId);
      onAction();
    } catch {
      // Silently handle - UI will refresh
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    setLoading(true);
    try {
      await resumeOrchestration(orchestrationId);
      onAction();
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }

  async function handleRetry(phase: string) {
    setLoading(true);
    try {
      await retryPhase(orchestrationId, phase);
      onAction();
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
          key={phase.phase_number}
          onClick={() => handleRetry(phase.phase_number)}
          disabled={loading}
          className="px-3 py-1 text-xs rounded bg-red-800 text-red-200 hover:bg-red-700 disabled:opacity-50"
        >
          Retry phase {phase.phase_number}
        </button>
      ))}
    </div>
  );
}
