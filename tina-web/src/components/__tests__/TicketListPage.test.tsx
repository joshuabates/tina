import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  buildSpecSummary,
  some,
  none,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import type { TicketSummary, SpecSummary } from "@/schemas"

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
]

function buildTicketSummary(overrides: Partial<TicketSummary> = {}): TicketSummary {
  return {
    _id: "t1",
    _creationTime: 1234567890,
    projectId: "p1",
    specId: none<string>(),
    ticketKey: "ALPHA-T1",
    title: "Implement login",
    description: "Add login form",
    status: "todo",
    priority: "medium",
    estimate: none<string>(),
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z",
    closedAt: none<string>(),
    ...overrides,
  }
}

const specs: SpecSummary[] = [
  buildSpecSummary({
    _id: "d1",
    specKey: "ALPHA-D1",
    title: "Authentication Flow",
  }),
  buildSpecSummary({
    _id: "d2",
    _creationTime: 1234567891,
    specKey: "ALPHA-D2",
    title: "Data Model",
  }),
]

const tickets: TicketSummary[] = [
  buildTicketSummary({
    _id: "t1",
    ticketKey: "ALPHA-T1",
    title: "Implement login",
    status: "todo",
    priority: "high",
    specId: some("d1"),
  }),
  buildTicketSummary({
    _id: "t2",
    _creationTime: 1234567891,
    ticketKey: "ALPHA-T2",
    title: "Add dashboard",
    status: "in_progress",
    priority: "medium",
    specId: none<string>(),
  }),
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
  "tickets.list": querySuccess(tickets),
  "tickets.get": querySuccess(tickets[0]),
  "specs.list": querySuccess(specs),
  "workComments.list": querySuccess([]),
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

describe("TicketListPage", () => {
  it("renders loading state when query is loading", () => {
    renderApp("/projects/p1/plan/tickets", {
      ...defaultStates,
      "tickets.list": queryLoading(),
    })

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
    expect(screen.getByTestId("ticket-list-loading")).toBeInTheDocument()
  })

  it("renders empty state when no tickets exist", () => {
    renderApp("/projects/p1/plan/tickets", {
      ...defaultStates,
      "tickets.list": querySuccess([]),
    })

    expect(screen.getByText(/no tickets/i)).toBeInTheDocument()
  })

  it("renders table with ticket rows when tickets exist", () => {
    renderApp("/projects/p1/plan/tickets")

    const table = screen.getByRole("table")
    expect(table).toBeInTheDocument()

    const rows = within(table).getAllByRole("row")
    // header row + 2 data rows
    expect(rows).toHaveLength(3)
  })

  it("displays ticket key and title", () => {
    renderApp("/projects/p1/plan/tickets")

    expect(screen.getByText("ALPHA-T1")).toBeInTheDocument()
    expect(screen.getByText("Implement login")).toBeInTheDocument()
    expect(screen.getByText("ALPHA-T2")).toBeInTheDocument()
    expect(screen.getByText("Add dashboard")).toBeInTheDocument()
  })

  it("renders correct status labels for ticket statuses", () => {
    renderApp("/projects/p1/plan/tickets")

    // "todo" should render as "Todo", "in_progress" as "In Progress"
    expect(screen.getByText("Todo")).toBeInTheDocument()
    expect(screen.getByText("In Progress")).toBeInTheDocument()
  })

  it("renders priority badges", () => {
    renderApp("/projects/p1/plan/tickets")

    expect(screen.getByText("High")).toBeInTheDocument()
    expect(screen.getByText("Medium")).toBeInTheDocument()
  })

  it("renders Spec Link column header", () => {
    renderApp("/projects/p1/plan/tickets")

    const table = screen.getByRole("table")
    expect(within(table).getByText("Spec Link")).toBeInTheDocument()
  })

  it("displays spec key as link when ticket has specId", () => {
    renderApp("/projects/p1/plan/tickets")

    // Ticket t1 has specId "d1" which maps to spec with key "ALPHA-D1"
    const link = screen.getByRole("link", { name: /ALPHA-D1/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/projects/p1/plan/specs/d1"),
    )
  })

  it("displays dash when ticket has no specId", () => {
    renderApp("/projects/p1/plan/tickets")

    const table = screen.getByRole("table")
    const rows = within(table).getAllByRole("row")
    // Row 2 (index 2) is the second data row (ticket t2, no specId)
    const specCell = within(rows[2]).getAllByRole("cell")[3]
    expect(specCell).toHaveTextContent("—")
  })

  it("clicking a ticket row navigates to detail page", async () => {
    const user = userEvent.setup()
    renderApp("/projects/p1/plan/tickets")

    const rows = screen.getAllByRole("row")
    // Click the first data row (skip header)
    await user.click(rows[1])

    expect(screen.getByTestId("ticket-detail-page")).toBeInTheDocument()
  })

  it("shows create ticket button", () => {
    renderApp("/projects/p1/plan/tickets")

    expect(screen.getByRole("button", { name: /create ticket/i })).toBeInTheDocument()
  })

  it("renders page title", () => {
    renderApp("/projects/p1/plan/tickets")

    expect(screen.getByRole("heading", { name: "Tickets" })).toBeInTheDocument()
  })

  describe("create form modal", () => {
    it("opens modal when Create Ticket button is clicked", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/tickets")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(within(dialog).getByRole("heading", { name: "Create Ticket" })).toBeInTheDocument()
    })

    it("shows spec link dropdown with project specs in modal", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/tickets")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))

      const dialog = screen.getByRole("dialog")
      const specSelect = within(dialog).getByLabelText(/spec/i)
      expect(specSelect).toBeInTheDocument()
      expect(specSelect.tagName).toBe("SELECT")

      const options = within(specSelect as HTMLElement).getAllByRole("option")
      expect(options).toHaveLength(3) // None + 2 specs
      expect(options[0]).toHaveTextContent("None")
      expect(options[1]).toHaveTextContent("ALPHA-D1")
      expect(options[2]).toHaveTextContent("ALPHA-D2")
    })

    it("closes modal when close button is clicked", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/tickets")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: /close/i }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })
})
