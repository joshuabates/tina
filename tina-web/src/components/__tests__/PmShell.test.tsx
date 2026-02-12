import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
  it("does not render a PM-specific sidebar", () => {
    renderApp("/pm?project=p1")

    // The old PM sidebar should be gone
    expect(
      screen.queryByRole("navigation", { name: /project navigation/i }),
    ).not.toBeInTheDocument()
  })

  it("renders a segmented control with Tickets and Designs tabs", () => {
    renderApp("/pm?project=p1")

    const shell = screen.getByTestId("pm-shell")
    expect(within(shell).getByRole("tab", { name: /tickets/i })).toBeInTheDocument()
    expect(within(shell).getByRole("tab", { name: /designs/i })).toBeInTheDocument()
  })

  it("shows Tickets tab as active by default", () => {
    renderApp("/pm?project=p1")

    const ticketsTab = screen.getByRole("tab", { name: /tickets/i })
    expect(ticketsTab).toHaveAttribute("aria-selected", "true")
  })

  it("switches to Designs content when Designs tab is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    const designsTab = screen.getByRole("tab", { name: /designs/i })
    await user.click(designsTab)

    expect(designsTab).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: /tickets/i })).toHaveAttribute("aria-selected", "false")
  })

  it("renders ticket list content when Tickets tab is active", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })

  it("renders design list content when Designs tab is active", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    expect(screen.getByTestId("design-list-page")).toBeInTheDocument()
  })

  it("shows project name in workspace header", () => {
    renderApp("/pm?project=p1")

    const shell = screen.getByTestId("pm-shell")
    expect(within(shell).getByRole("heading", { name: "Project Alpha" })).toBeInTheDocument()
  })

  it("shows 'select a project' when no project param", () => {
    renderApp("/pm")

    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })
})
