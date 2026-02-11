import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  some,
  none,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import type { TicketSummary } from "@/schemas"

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
    designId: none<string>(),
    ticketKey: "ALPHA-T1",
    title: "Implement login",
    description: "Add login form",
    status: "open",
    priority: "medium",
    assignee: none<string>(),
    estimate: none<string>(),
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z",
    closedAt: none<string>(),
    ...overrides,
  }
}

const tickets: TicketSummary[] = [
  buildTicketSummary({
    _id: "t1",
    ticketKey: "ALPHA-T1",
    title: "Implement login",
    status: "open",
    priority: "high",
    assignee: some("alice"),
    designId: some("d1"),
  }),
  buildTicketSummary({
    _id: "t2",
    _creationTime: 1234567891,
    ticketKey: "ALPHA-T2",
    title: "Add dashboard",
    status: "in_progress",
    priority: "medium",
    assignee: none<string>(),
    designId: none<string>(),
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
    renderApp("/pm/tickets?project=p1", {
      ...defaultStates,
      "tickets.list": queryLoading(),
    })

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
    expect(screen.getByTestId("ticket-list-loading")).toBeInTheDocument()
  })

  it("renders empty state when no tickets exist", () => {
    renderApp("/pm/tickets?project=p1", {
      ...defaultStates,
      "tickets.list": querySuccess([]),
    })

    expect(screen.getByText(/no tickets/i)).toBeInTheDocument()
  })

  it("renders table with ticket rows when tickets exist", () => {
    renderApp("/pm/tickets?project=p1")

    const table = screen.getByRole("table")
    expect(table).toBeInTheDocument()

    const rows = within(table).getAllByRole("row")
    // header row + 2 data rows
    expect(rows).toHaveLength(3)
  })

  it("displays ticket key and title", () => {
    renderApp("/pm/tickets?project=p1")

    expect(screen.getByText("ALPHA-T1")).toBeInTheDocument()
    expect(screen.getByText("Implement login")).toBeInTheDocument()
    expect(screen.getByText("ALPHA-T2")).toBeInTheDocument()
    expect(screen.getByText("Add dashboard")).toBeInTheDocument()
  })

  it("renders status badges for each ticket", () => {
    renderApp("/pm/tickets?project=p1")

    // StatusBadge renders with toStatusBadgeStatus mapping
    // "open" maps to fallback (planning label), "in_progress" maps to "In Progress"
    expect(screen.getByText("In Progress")).toBeInTheDocument()
  })

  it("renders priority badges", () => {
    renderApp("/pm/tickets?project=p1")

    expect(screen.getByText("High")).toBeInTheDocument()
    expect(screen.getByText("Medium")).toBeInTheDocument()
  })

  it("displays assignee when present", () => {
    renderApp("/pm/tickets?project=p1")

    expect(screen.getByText("alice")).toBeInTheDocument()
  })

  it("clicking a ticket row navigates to detail page", async () => {
    const user = userEvent.setup()
    renderApp("/pm/tickets?project=p1")

    const rows = screen.getAllByRole("row")
    // Click the first data row (skip header)
    await user.click(rows[1])

    expect(screen.getByTestId("ticket-detail-page")).toBeInTheDocument()
  })

  it("shows create ticket button", () => {
    renderApp("/pm/tickets?project=p1")

    expect(screen.getByRole("button", { name: /create ticket/i })).toBeInTheDocument()
  })

  it("shows no project selected message when no project param", () => {
    renderApp("/pm/tickets")

    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })

  it("renders page title", () => {
    renderApp("/pm/tickets?project=p1")

    expect(screen.getByRole("heading", { name: "Tickets" })).toBeInTheDocument()
  })
})
