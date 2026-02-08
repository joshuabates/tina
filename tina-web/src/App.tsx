import { Route, Routes } from "react-router-dom";
import { useOrchestrations } from "./hooks/useOrchestrations";
import Dashboard from "./components/Dashboard";
import OrchestrationDetail from "./components/OrchestrationDetail";
import TaskDetail from "./components/TaskDetail";

export default function App() {
  const { orchestrations } = useOrchestrations();

  return (
    <Routes>
      <Route path="/" element={<Dashboard orchestrations={orchestrations} />} />
      <Route path="/orchestrations/:id" element={<OrchestrationDetail />} />
      <Route path="/orchestrations/:id/tasks/:taskId" element={<TaskDetail />} />
    </Routes>
  );
}
