import { Link, useParams } from "react-router-dom";
import type { Id } from "@convex/_generated/dataModel";
import { useProjectOrchestrations } from "../hooks/useProjectOrchestrations";
import OrchestrationList from "./OrchestrationList";

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();

  const { orchestrations, loading } = useProjectOrchestrations(
    projectId as Id<"projects">,
  );

  return (
    <div className="p-4">
      <Link to="/" className="text-cyan-400 hover:underline text-sm mb-4 inline-block">
        &larr; Back to projects
      </Link>
      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          Loading...
        </div>
      ) : (
        <OrchestrationList orchestrations={orchestrations} />
      )}
    </div>
  );
}
