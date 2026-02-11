import { Outlet } from "react-router-dom"

export function PmShell() {
  return (
    <div data-testid="pm-shell">
      <Outlet />
    </div>
  )
}
