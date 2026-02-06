import { Route, Routes } from "react-router-dom";
import { useOrchestrations } from "./hooks/useOrchestrations";
import OrchestrationDetail from "./components/OrchestrationDetail";
import OrchestrationList from "./components/OrchestrationList";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { orchestrations, connected, lastUpdate } = useOrchestrations();

  return (
    <div className="pb-8">
      <Routes>
        <Route
          path="/"
          element={<OrchestrationList orchestrations={orchestrations} />}
        />
        <Route
          path="/orchestration/:id"
          element={<OrchestrationDetail orchestrations={orchestrations} />}
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
