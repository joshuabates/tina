import { Route, Routes } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { OrchestrationPage } from "./components/OrchestrationPage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OrchestrationPage />} />
        <Route path="*" element={<OrchestrationPage />} />
      </Route>
    </Routes>
  )
}
