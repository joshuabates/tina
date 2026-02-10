import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { RuntimeProvider } from "@/providers/RuntimeProvider"

export function renderWithRouter(ui: ReactNode, route = "/") {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}

export function renderWithRuntime(ui: ReactNode, route = "/") {
  return render(
    <RuntimeProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </RuntimeProvider>,
  )
}
