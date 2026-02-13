import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  some,
} from "@/test/builders/domain"
import { querySuccess, type QueryStateMap } from "@/test/builders/query"
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

const defaultStates: Partial<QueryStateMap> = {
  "projects.list": querySuccess([
    buildProjectSummary({ _id: "p1", orchestrationCount: 1 }),
  ]),
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

describe("Plan routes", () => {
  it("renders PmShell when navigating to /projects/:projectId/plan", () => {
    renderApp("/projects/p1/plan")
    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
  })

  it("renders DesignDetailPage when navigating to /projects/:projectId/plan/designs/:designId", () => {
    renderApp("/projects/p1/plan/designs/design-123")
    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
    expect(screen.getByTestId("design-detail-page")).toBeInTheDocument()
  })

  it("renders TicketDetailPage when navigating to /projects/:projectId/plan/tickets/:ticketId", () => {
    renderApp("/projects/p1/plan/tickets/ticket-456")
    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
    expect(screen.getByTestId("ticket-detail-page")).toBeInTheDocument()
  })

  it("plan mode is nested inside AppShell", () => {
    renderApp("/projects/p1/plan")
    expect(screen.getByRole("navigation", { name: /mode rail/i })).toBeInTheDocument()
    expect(screen.getByRole("main")).toBeInTheDocument()
    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
  })

  it("/projects/:projectId/plan defaults to ticket list route", () => {
    renderApp("/projects/p1/plan")
    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })
})
