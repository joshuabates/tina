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

describe("PM routes", () => {
  it("renders PmShell when navigating to /pm", () => {
    renderApp("/pm")

    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
  })

  it("renders DesignDetailPage when navigating to /pm/designs/:designId", () => {
    renderApp("/pm/designs/design-123")

    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
    expect(screen.getByTestId("design-detail-page")).toBeInTheDocument()
  })

  it("renders TicketDetailPage when navigating to /pm/tickets/:ticketId", () => {
    renderApp("/pm/tickets/ticket-456")

    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
    expect(screen.getByTestId("ticket-detail-page")).toBeInTheDocument()
  })

  it("PmShell is nested inside AppShell", () => {
    renderApp("/pm")

    expect(screen.getByRole("banner")).toBeInTheDocument()
    expect(screen.getByRole("main")).toBeInTheDocument()
    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
  })

  it("global sidebar remains visible on PM routes", () => {
    renderApp("/pm?project=p1")

    expect(
      screen.getByRole("navigation", { name: /main sidebar/i }),
    ).toBeInTheDocument()
  })

  it("/pm index renders ticket list content by default", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })
})
