import { Link } from "react-router-dom";
import type { Orchestration, Project } from "../types";
import OrchestrationList from "./OrchestrationList";
import AddProjectForm from "./AddProjectForm";

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

interface Props {
  projects: Project[];
  orchestrations: Orchestration[];
  onProjectCreated: () => void;
}

export default function Dashboard({ projects, orchestrations, onProjectCreated }: Props) {
  if (projects.length === 0) {
    return <OrchestrationList orchestrations={orchestrations} />;
  }

  // Build a map from project_id to most recent orchestration
  const latestByProject = new Map<number, Orchestration>();
  for (const orch of orchestrations) {
    const existing = latestByProject.get(orch.project_id);
    if (!existing || orch.started_at > existing.started_at) {
      latestByProject.set(orch.project_id, orch);
    }
  }

  return (
    <div data-testid="dashboard" className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Projects</h1>
        <span className="text-sm text-gray-500">
          {orchestrations.length} orchestration{orchestrations.length !== 1 ? "s" : ""} total
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {projects.map((project) => {
          const latest = latestByProject.get(project.id);
          return (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              data-testid={`project-card-${project.id}`}
              className="bg-gray-900 rounded-lg p-4 hover:bg-gray-800/80 transition-colors"
            >
              <h2 className="font-semibold text-lg mb-1">{project.name}</h2>
              <p className="text-sm text-gray-500 font-mono truncate mb-2">{project.repo_path}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  {project.orchestration_count} orchestration{project.orchestration_count !== 1 ? "s" : ""}
                </span>
                {latest && (
                  <span className={statusColor(latest.status)}>
                    {latest.feature_name}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <AddProjectForm onCreated={onProjectCreated} />
    </div>
  );
}
