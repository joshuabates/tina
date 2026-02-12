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
import type { DesignSummary } from "@/schemas"

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

function buildDesignSummary(overrides: Partial<DesignSummary> = {}): DesignSummary {
  return {
    _id: "d1",
    _creationTime: 1234567890,
    projectId: "p1",
    designKey: "ALPHA-D1",
    title: "Authentication Flow",
    markdown: "# Auth\nDesign for auth flow",
    status: "draft",
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z",
    archivedAt: none<string>(),
    ...overrides,
  }
}

function buildTicketSummary(overrides: Partial<TicketSummary> = {}): TicketSummary {
  return {
    _id: "t1",
    _creationTime: 1234567890,
    projectId: "p1",
    designId: none<string>(),
    ticketKey: "ALPHA-T1",
    title: "Implement login",
    description: "Add login form",
    status: "todo",
    priority: "medium",
    assignee: none<string>(),
    estimate: none<string>(),
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z",
    closedAt: none<string>(),
    ...overrides,
  }
}

const designs: DesignSummary[] = [
  buildDesignSummary({
    _id: "d1",
    designKey: "ALPHA-D1",
    title: "Authentication Flow",
  }),
  buildDesignSummary({
    _id: "d2",
    _creationTime: 1234567891,
    designKey: "ALPHA-D2",
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
  "tickets.get": querySuccess(tickets[0]),
  "designs.list": querySuccess(designs),
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
    renderApp("/pm?project=p1", {
      ...defaultStates,
      "tickets.list": queryLoading(),
    })

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
    expect(screen.getByTestId("ticket-list-loading")).toBeInTheDocument()
  })

  it("renders empty state when no tickets exist", () => {
    renderApp("/pm?project=p1", {
      ...defaultStates,
      "tickets.list": querySuccess([]),
    })

    expect(screen.getByText(/no tickets/i)).toBeInTheDocument()
  })

  it("renders table with ticket rows when tickets exist", () => {
    renderApp("/pm?project=p1")

    const table = screen.getByRole("table")
    expect(table).toBeInTheDocument()

    const rows = within(table).getAllByRole("row")
    // header row + 2 data rows
    expect(rows).toHaveLength(3)
  })

  it("displays ticket key and title", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByText("ALPHA-T1")).toBeInTheDocument()
    expect(screen.getByText("Implement login")).toBeInTheDocument()
    expect(screen.getByText("ALPHA-T2")).toBeInTheDocument()
    expect(screen.getByText("Add dashboard")).toBeInTheDocument()
  })

  it("renders correct status labels for ticket statuses", () => {
    renderApp("/pm?project=p1")

    // "todo" should render as "Todo", "in_progress" as "In Progress"
    expect(screen.getByText("Todo")).toBeInTheDocument()
    expect(screen.getByText("In Progress")).toBeInTheDocument()
  })

  it("renders priority badges", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByText("High")).toBeInTheDocument()
    expect(screen.getByText("Medium")).toBeInTheDocument()
  })

  it("displays assignee when present", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByText("alice")).toBeInTheDocument()
  })

  it("renders Design Link column header", () => {
    renderApp("/pm?project=p1")

    const table = screen.getByRole("table")
    expect(within(table).getByText("Design Link")).toBeInTheDocument()
  })

  it("displays design key as link when ticket has designId", () => {
    renderApp("/pm?project=p1")

    // Ticket t1 has designId "d1" which maps to design with key "ALPHA-D1"
    const link = screen.getByRole("link", { name: /ALPHA-D1/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", expect.stringContaining("/pm/designs/d1"))
  })

  it("displays dash when ticket has no designId", () => {
    renderApp("/pm?project=p1")

    const table = screen.getByRole("table")
    const rows = within(table).getAllByRole("row")
    // Row 2 (index 2) is the second data row (ticket t2, no designId)
    const designCell = within(rows[2]).getAllByRole("cell")[3]
    expect(designCell).toHaveTextContent("—")
  })

  it("clicking a ticket row navigates to detail page", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    const rows = screen.getAllByRole("row")
    // Click the first data row (skip header)
    await user.click(rows[1])

    expect(screen.getByTestId("ticket-detail-page")).toBeInTheDocument()
  })

  it("shows create ticket button", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByRole("button", { name: /create ticket/i })).toBeInTheDocument()
  })

  it("shows no project selected message when no project param", () => {
    renderApp("/pm")

    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })

  it("treats an empty project param as no project and skips invalid ID args", () => {
    renderApp("/pm?project=")

    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })

  it("renders page title", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByRole("heading", { name: "Tickets" })).toBeInTheDocument()
  })

  describe("create form", () => {
    it("shows design link dropdown with project designs", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))

      const form = screen.getByTestId("ticket-create-form")
      const designSelect = within(form).getByLabelText(/design/i)
      expect(designSelect).toBeInTheDocument()
      expect(designSelect.tagName).toBe("SELECT")

      // Should have "None" option plus each design
      const options = within(designSelect as HTMLElement).getAllByRole("option")
      expect(options).toHaveLength(3) // None + 2 designs
      expect(options[0]).toHaveTextContent("None")
      expect(options[1]).toHaveTextContent("ALPHA-D1")
      expect(options[2]).toHaveTextContent("ALPHA-D2")
    })

    it("shows assignee text input", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("button", { name: /create ticket/i }))

      const form = screen.getByTestId("ticket-create-form")
      const assigneeInput = within(form).getByLabelText(/assignee/i)
      expect(assigneeInput).toBeInTheDocument()
      expect(assigneeInput).toHaveAttribute("type", "text")
    })
  })
})
