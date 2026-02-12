import { Route, Routes } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { OrchestrationPage } from "./components/OrchestrationPage"
import { PmShell } from "./components/pm/PmShell"
import { DesignDetailPage } from "./components/pm/DesignDetailPage"
import { TicketDetailPage } from "./components/pm/TicketDetailPage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OrchestrationPage />} />
        <Route path="pm" element={<PmShell />}>
          <Route path="designs/:designId" element={<DesignDetailPage />} />
          <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
        </Route>
        <Route path="*" element={<OrchestrationPage />} />
      </Route>
    </Routes>
  )
}
