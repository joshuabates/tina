import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchProjectOrchestrations } from "../api";
import type { Orchestration } from "../types";
import OrchestrationList from "./OrchestrationList";

interface Props {
  onUpdate?: (listener: () => void) => () => void;
}

export default function ProjectDetail({ onUpdate }: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const [orchestrations, setOrchestrations] = useState<Orchestration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetchProjectOrchestrations(Number(projectId))
      .then(setOrchestrations)
      .catch(() => setOrchestrations([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Re-fetch on WebSocket updates
  useEffect(() => {
    if (!onUpdate || !projectId) return;
    return onUpdate(() => {
      fetchProjectOrchestrations(Number(projectId))
        .then(setOrchestrations)
        .catch(() => {});
    });
  }, [onUpdate, projectId]);

  return (
    <div className="p-4">
      <Link to="/" className="text-cyan-400 hover:underline text-sm">&larr; Back to projects</Link>
      {loading ? (
        <p className="mt-4 text-gray-500">Loading...</p>
      ) : (
        <div className="mt-2">
          <OrchestrationList orchestrations={orchestrations} />
        </div>
      )}
    </div>
  );
}
