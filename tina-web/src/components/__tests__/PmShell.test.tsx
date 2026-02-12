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
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"

vi.mock("@/hooks/useTypedQuery")

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

describe("PmShell", () => {
  it("renders sidebar and content areas with grid layout", () => {
    renderApp("/pm")

    const shell = screen.getByTestId("pm-shell")
    expect(shell).toBeInTheDocument()

    const sidebar = screen.getByRole("navigation", { name: /project/i })
    expect(sidebar).toBeInTheDocument()
  })

  it("renders project list in sidebar", () => {
    renderApp("/pm")

    const sidebar = screen.getByRole("navigation", { name: /project/i })
    expect(within(sidebar).getByText("Project Alpha")).toBeInTheDocument()
    expect(within(sidebar).getByText("Project Beta")).toBeInTheDocument()
  })

  it("renders Tickets and Designs sub-rows for each project", () => {
    renderApp("/pm")

    const sidebar = screen.getByRole("navigation", { name: /project/i })
    const ticketLinks = within(sidebar).getAllByRole("link", { name: /tickets/i })
    const designLinks = within(sidebar).getAllByRole("link", { name: /designs/i })

    expect(ticketLinks).toHaveLength(2)
    expect(designLinks).toHaveLength(2)
  })

  it("navigates to /pm/tickets?project=<id> when clicking Tickets", async () => {
    const user = userEvent.setup()
    renderApp("/pm")

    // Click the first Tickets link (for Project Alpha, p1)
    const ticketLinks = screen.getAllByRole("link", { name: /tickets/i })
    await user.click(ticketLinks[0])

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })

  it("navigates to /pm/designs?project=<id> when clicking Designs", async () => {
    const user = userEvent.setup()
    renderApp("/pm")

    const designLinks = screen.getAllByRole("link", { name: /designs/i })
    await user.click(designLinks[0])

    expect(screen.getByTestId("design-list-page")).toBeInTheDocument()
  })

  it("highlights active project based on ?project= search param", () => {
    renderApp("/pm/tickets?project=p1")

    const sidebar = screen.getByRole("navigation", { name: /project/i })
    const projectAlpha = within(sidebar).getByText("Project Alpha")

    // The project group should have an active state
    expect(projectAlpha.closest("[data-active]")).toHaveAttribute(
      "data-active",
      "true",
    )
  })

  it("highlights active entity row based on current route", () => {
    renderApp("/pm/tickets?project=p1")

    const sidebar = screen.getByRole("navigation", { name: /project/i })
    // The Tickets link for p1 should be active
    const ticketLinks = within(sidebar).getAllByRole("link", { name: /tickets/i })
    expect(ticketLinks[0]).toHaveAttribute("aria-current", "page")
  })

  it("renders child route content via Outlet", () => {
    renderApp("/pm")

    // Default route is TicketListPage
    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })

  it("shows loading state when projects are loading", () => {
    renderApp("/pm", {
      ...defaultStates,
      "projects.list": queryLoading(),
    })

    const shell = screen.getByTestId("pm-shell")
    expect(shell).toBeInTheDocument()
    // Should not show project names when loading
    expect(screen.queryByText("Project Alpha")).not.toBeInTheDocument()
  })

  it("shows empty state when no projects exist", () => {
    renderApp("/pm", {
      ...defaultStates,
      "projects.list": querySuccess([]),
    })

    expect(screen.getByText(/no projects/i)).toBeInTheDocument()
  })

  it("renders an Orchestrations link that navigates to /", () => {
    renderApp("/pm")

    const sidebar = screen.getByRole("navigation", { name: /project/i })
    const link = within(sidebar).getByRole("link", { name: /orchestrations/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "/")
  })
})
