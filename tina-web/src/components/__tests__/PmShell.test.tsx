import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  some,
} from "@/test/builders/domain"
import {
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"

vi.mock("@/hooks/useTypedQuery")
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const projects = [
  buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 0 }),
  buildProjectSummary({ _id: "p2", name: "Project Beta", orchestrationCount: 0 }),
]

const defaultStates: Partial<QueryStateMap> = {
  "projects.list": querySuccess(projects),
  "orchestrations.list": querySuccess([
    buildOrchestrationSummary({
      _id: "orch1",
      projectId: some("p1"),
      featureName: "test-feature",
      status: "executing",
    }),
  ]),
  "tickets.list": querySuccess([]),
  "designs.list": querySuccess([]),
  "nodes.list": querySuccess([]),
}

function renderApp(route: string, states: Partial<QueryStateMap> = defaultStates) {
  return renderWithAppRuntime(<App />, {
    route,
    mockUseTypedQuery,
    states,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PmShell - unified workspace", () => {
  it("does not render the plan sidebar navigation", () => {
    renderApp("/projects/p1/plan")

    expect(
      screen.queryByRole("navigation", { name: /plan sidebar/i }),
    ).not.toBeInTheDocument()
  })

  it("renders tickets/designs toggle in main content", () => {
    renderApp("/projects/p1/plan")

    expect(screen.getByRole("navigation", { name: /plan list view toggle/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Tickets" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Designs" })).toBeInTheDocument()
  })

  it("renders ticket list content on tickets route", () => {
    renderApp("/projects/p1/plan/tickets")

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })

  it("renders design list content on designs route", () => {
    renderApp("/projects/p1/plan/designs")
    expect(screen.getByTestId("design-list-page")).toBeInTheDocument()
  })

  it("does not show project name in workspace header", () => {
    renderApp("/projects/p1/plan")

    expect(screen.queryByRole("heading", { name: "Project Alpha" })).not.toBeInTheDocument()
  })

  it("recovers from unknown project IDs via root resolver", () => {
    renderApp("/projects/unknown/plan")
    expect(screen.getByRole("navigation", { name: /mode rail/i })).toBeInTheDocument()
  })

  it("renders Launch button in workspace header", () => {
    renderApp("/projects/p1/plan", {
      ...defaultStates,
      "designs.list": querySuccess([]),
      "nodes.list": querySuccess([]),
    })

    expect(screen.getByRole("button", { name: /launch/i })).toBeInTheDocument()
  })
})
