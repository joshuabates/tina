import { Route, Routes } from "react-router-dom";
import { useOrchestrations } from "./hooks/useOrchestrations";
import { useProjects } from "./hooks/useProjects";
import Dashboard from "./components/Dashboard";
import OrchestrationDetail from "./components/OrchestrationDetail";
import ProjectDetail from "./components/ProjectDetail";
import TaskDetail from "./components/TaskDetail";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { orchestrations, connected, lastUpdate, onUpdate } = useOrchestrations();
  const { projects, refresh: refreshProjects } = useProjects(onUpdate);

  return (
    <div className="pb-8">
      <Routes>
        <Route
          path="/"
          element={
            <Dashboard
              projects={projects}
              orchestrations={orchestrations}
              onProjectCreated={refreshProjects}
            />
          }
        />
        <Route
          path="/projects/:projectId"
          element={<ProjectDetail onUpdate={onUpdate} />}
        />
        <Route
          path="/orchestrations/:id"
          element={<OrchestrationDetail onUpdate={onUpdate} />}
        />
        <Route
          path="/orchestrations/:id/tasks/:taskId"
          element={<TaskDetail />}
        />
      </Routes>
      <StatusBar
        connected={connected}
        lastUpdate={lastUpdate}
        orchestrationCount={orchestrations.length}
      />
    </div>
  );
}
