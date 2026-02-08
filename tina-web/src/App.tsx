import { Route, Routes } from "react-router-dom";
import { useOrchestrations } from "./hooks/useOrchestrations";
import { useProjects } from "./hooks/useProjects";
import Dashboard from "./components/Dashboard";
import OrchestrationDetail from "./components/OrchestrationDetail";
import ProjectDetail from "./components/ProjectDetail";
import TaskDetail from "./components/TaskDetail";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { orchestrations } = useOrchestrations();
  const { projects } = useProjects();

  return (
    <div className="pb-8">
      <Routes>
        <Route
          path="/"
          element={
            <Dashboard orchestrations={orchestrations} projects={projects} />
          }
        />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/orchestrations/:id" element={<OrchestrationDetail />} />
        <Route
          path="/orchestrations/:id/tasks/:taskId"
          element={<TaskDetail />}
        />
      </Routes>
      <StatusBar orchestrationCount={orchestrations.length} />
    </div>
  );
}
