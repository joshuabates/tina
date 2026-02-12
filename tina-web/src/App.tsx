import { Route, Routes } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { OrchestrationPage } from "./components/OrchestrationPage"
import { PmShell } from "./components/pm/PmShell"
import { DesignListPage } from "./components/pm/DesignListPage"
import { DesignDetailPage } from "./components/pm/DesignDetailPage"
import { LaunchOrchestrationPage } from "./components/pm/LaunchOrchestrationPage"
import { TicketListPage } from "./components/pm/TicketListPage"
import { TicketDetailPage } from "./components/pm/TicketDetailPage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OrchestrationPage />} />
        <Route path="pm" element={<PmShell />}>
          <Route index element={<TicketListPage />} />
          <Route path="designs" element={<DesignListPage />} />
          <Route path="designs/:designId" element={<DesignDetailPage />} />
          <Route path="launch" element={<LaunchOrchestrationPage />} />
          <Route path="tickets" element={<TicketListPage />} />
          <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
        </Route>
        <Route path="*" element={<OrchestrationPage />} />
      </Route>
    </Routes>
  )
}
