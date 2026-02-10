import { Route, Routes } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { useSelection } from "@/hooks/useSelection"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { OrchestrationListQuery } from "@/services/data/queryDefs"

function OrchestrationPlaceholder() {
  const { orchestrationId } = useSelection()
  const orchestrationsResult = useTypedQuery(OrchestrationListQuery, {})

  // No selection
  if (!orchestrationId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select an orchestration from the sidebar
      </div>
    )
  }

  // Loading state
  if (orchestrationsResult.status === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    )
  }

  // Error state
  if (orchestrationsResult.status === "error") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Error loading orchestrations
      </div>
    )
  }

  // Find the selected orchestration
  const orchestration = orchestrationsResult.data.find((o) => o._id === orchestrationId)

  // Not found
  if (!orchestration) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Orchestration not found
      </div>
    )
  }

  // Show the feature name (temporary placeholder)
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{orchestration.featureName}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Phase {orchestration.currentPhase} of {orchestration.totalPhases} • {orchestration.status}
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OrchestrationPlaceholder />} />
        <Route path="*" element={<OrchestrationPlaceholder />} />
      </Route>
    </Routes>
  )
}
