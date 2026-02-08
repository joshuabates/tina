import { Link } from "react-router-dom";
import type { Orchestration, Project } from "../types";
import OrchestrationList from "./OrchestrationList";

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

interface Props {
  orchestrations: Orchestration[];
  projects: Project[];
}

export default function Dashboard({ orchestrations, projects }: Props) {
  if (projects.length === 0) {
    return <OrchestrationList orchestrations={orchestrations} />;
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Projects</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {projects.map((project) => (
          <Link
            key={project._id}
            to={`/projects/${encodeURIComponent(project._id)}`}
            className="block border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors"
          >
            <h2 className="text-lg font-medium text-cyan-400 mb-1">
              {project.name}
            </h2>
            <p className="text-sm text-gray-500 font-mono truncate mb-3">
              {project.repoPath}
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">
                {project.orchestrationCount}{" "}
                {project.orchestrationCount === 1
                  ? "orchestration"
                  : "orchestrations"}
              </span>
              {project.latestStatus && (
                <span className={statusColor(project.latestStatus)}>
                  {statusLabel(project.latestStatus)}
                </span>
              )}
            </div>
            {project.latestFeature && (
              <p className="text-xs text-gray-500 mt-2 truncate">
                Latest: {project.latestFeature}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
