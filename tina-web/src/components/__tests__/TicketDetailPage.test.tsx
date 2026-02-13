import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  buildDesignSummary,
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
    useMutation: vi.fn(() => mockMutationFn),
  }
})

const mockMutationFn = vi.fn()

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const projects = [
  buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 0 }),
]

function buildTicket(overrides: Partial<TicketSummary> = {}): TicketSummary {
  return {
    _id: "t1",
    _creationTime: 1234567890,
    projectId: "p1",
    designId: none<string>(),
    ticketKey: "ALPHA-T1",
    title: "Implement login",
    description: "Add a login form with email and password fields",
    status: "todo",
    priority: "high",
    estimate: none<string>(),
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z",
    closedAt: none<string>(),
    ...overrides,
  }
}

const defaultTicket = buildTicket()

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
  "tickets.get": querySuccess(defaultTicket),
  "designs.list": querySuccess([buildDesignSummary({ title: "Auth Flow Design", markdown: "# Auth", status: "approved" })]),
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
  mockMutationFn.mockResolvedValue("t1")
})

describe("TicketDetailPage", () => {
  it("renders loading state when ticket query is loading", () => {
    renderApp("/pm/tickets/t1?project=p1", {
      ...defaultStates,
      "tickets.get": queryLoading(),
    })

    expect(screen.getByTestId("ticket-detail-loading")).toBeInTheDocument()
  })

  it("renders not found when ticket is null", () => {
    renderApp("/pm/tickets/t1?project=p1", {
      ...defaultStates,
      "tickets.get": querySuccess(null),
    })

    expect(screen.getByText(/ticket not found/i)).toBeInTheDocument()
  })

  it("renders ticket key and title in header", () => {
    renderApp("/pm/tickets/t1?project=p1")

    expect(screen.getByText("ALPHA-T1")).toBeInTheDocument()
    expect(screen.getByText("Implement login")).toBeInTheDocument()
  })

  it("renders status badge", () => {
    renderApp("/pm/tickets/t1?project=p1")

    expect(screen.getByText("Todo")).toBeInTheDocument()
  })

  it("renders priority badge", () => {
    renderApp("/pm/tickets/t1?project=p1")

    const allHigh = screen.getAllByText("High")
    expect(allHigh.length).toBeGreaterThanOrEqual(1)
  })

  it("renders ticket description", () => {
    renderApp("/pm/tickets/t1?project=p1")

    expect(screen.getByText("Add a login form with email and password fields")).toBeInTheDocument()
  })

  it("renders ticket description as markdown with headings", () => {
    renderApp("/pm/tickets/t1?project=p1", {
      ...defaultStates,
      "tickets.get": querySuccess(buildTicket({
        description: "## Login details\n\nUse **email** and *password*.",
      })),
    })

    expect(screen.getByRole("heading", { level: 2, name: "Login details" })).toBeInTheDocument()
    expect(screen.getByText("email").tagName.toLowerCase()).toBe("strong")
    expect(screen.getByText("password").tagName.toLowerCase()).toBe("em")
  })

  it("renders metadata fields for priority", () => {
    renderApp("/pm/tickets/t1?project=p1")

    const priorityLabel = screen.getByText("Priority")
    expect(priorityLabel).toBeInTheDocument()
  })

  it("renders estimate when present", () => {
    renderApp("/pm/tickets/t1?project=p1", {
      ...defaultStates,
      "tickets.get": querySuccess(buildTicket({ estimate: some("2h") })),
    })

    expect(screen.getByText("2h")).toBeInTheDocument()
  })

  it("renders design link when ticket has designId", () => {
    renderApp("/pm/tickets/t1?project=p1", {
      ...defaultStates,
      "tickets.get": querySuccess(buildTicket({ designId: some("d1") })),
    })

    const link = screen.getByRole("link", { name: /ALPHA-D1/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", expect.stringContaining("/pm/designs/d1"))
  })

  it("renders comment timeline", () => {
    renderApp("/pm/tickets/t1?project=p1")

    expect(screen.getByTestId("comment-timeline")).toBeInTheDocument()
  })

  it("falls back to ticket project when project query param is empty", () => {
    renderApp("/pm/tickets/t1?project=")

    expect(screen.getByTestId("ticket-detail-page")).toBeInTheDocument()

    const designsListCall = mockUseTypedQuery.mock.calls.find(
      ([def]) => def.key === "designs.list",
    )

    expect(designsListCall).toBeDefined()
    expect(designsListCall?.[1]).toEqual({ projectId: "p1" })
  })

  describe("status transitions", () => {
    it("shows Start and Block and Cancel buttons for todo status", () => {
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(buildTicket({ status: "todo" })),
      })

      expect(screen.getByRole("button", { name: /^start$/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^block$/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument()
    })

    it("shows Submit for Review and Block and Cancel for in_progress", () => {
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(buildTicket({ status: "in_progress" })),
      })

      expect(screen.getByRole("button", { name: /submit for review/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^block$/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument()
    })

    it("shows Done and Rework for in_review", () => {
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(buildTicket({ status: "in_review" })),
      })

      expect(screen.getByRole("button", { name: /^done$/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^rework$/i })).toBeInTheDocument()
    })

    it("shows Unblock options and Cancel for blocked", () => {
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(buildTicket({ status: "blocked" })),
      })

      expect(screen.getByRole("button", { name: /unblock to todo/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /unblock to in progress/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument()
    })

    it("shows Reopen for done", () => {
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(buildTicket({ status: "done" })),
      })

      expect(screen.getByRole("button", { name: /^reopen$/i })).toBeInTheDocument()
    })

    it("shows Reopen for canceled", () => {
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(buildTicket({ status: "canceled" })),
      })

      expect(screen.getByRole("button", { name: /^reopen$/i })).toBeInTheDocument()
    })

    it("calls transitionTicket mutation on transition button click", async () => {
      const user = userEvent.setup()
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(buildTicket({ status: "todo" })),
      })

      await user.click(screen.getByRole("button", { name: /^start$/i }))

      expect(mockMutationFn).toHaveBeenCalledWith({
        ticketId: "t1",
        newStatus: "in_progress",
      })
    })
  })

  describe("edit mode", () => {
    it("shows edit button", () => {
      renderApp("/pm/tickets/t1?project=p1")

      expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument()
    })

    it("shows edit form when edit button is clicked", async () => {
      const user = userEvent.setup()
      renderApp("/pm/tickets/t1?project=p1")

      await user.click(screen.getByRole("button", { name: /^edit$/i }))

      expect(screen.getByTestId("ticket-edit-form")).toBeInTheDocument()
    })

    it("edit form has title, description, priority, estimate, design fields", async () => {
      const user = userEvent.setup()
      renderApp("/pm/tickets/t1?project=p1")

      await user.click(screen.getByRole("button", { name: /^edit$/i }))

      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/priority/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/estimate/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/design/i)).toBeInTheDocument()
    })

    it("edit form pre-fills current ticket values", async () => {
      const user = userEvent.setup()
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(
          buildTicket({ estimate: some("2h") }),
        ),
      })

      await user.click(screen.getByRole("button", { name: /^edit$/i }))

      expect(screen.getByLabelText(/title/i)).toHaveValue("Implement login")
      expect(screen.getByLabelText(/description/i)).toHaveValue(
        "Add a login form with email and password fields",
      )
      expect(screen.getByLabelText(/priority/i)).toHaveValue("high")
      expect(screen.getByLabelText(/estimate/i)).toHaveValue("2h")
    })

    it("cancel button exits edit mode", async () => {
      const user = userEvent.setup()
      renderApp("/pm/tickets/t1?project=p1")

      await user.click(screen.getByRole("button", { name: /^edit$/i }))
      const form = screen.getByTestId("ticket-edit-form")
      expect(form).toBeInTheDocument()

      // Click the cancel button within the edit form (not the status transition "Cancel")
      await user.click(within(form).getByRole("button", { name: /^cancel$/i }))
      expect(screen.queryByTestId("ticket-edit-form")).not.toBeInTheDocument()
    })

    it("save calls updateTicket mutation", async () => {
      const user = userEvent.setup()
      renderApp("/pm/tickets/t1?project=p1")

      await user.click(screen.getByRole("button", { name: /^edit$/i }))

      const titleInput = screen.getByLabelText(/title/i)
      await user.clear(titleInput)
      await user.type(titleInput, "Updated title")

      await user.click(screen.getByRole("button", { name: /^save$/i }))

      expect(mockMutationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: "t1",
          title: "Updated title",
        }),
      )
    })

    it("save sends clearDesignId when linked design is changed to None", async () => {
      const user = userEvent.setup()
      renderApp("/pm/tickets/t1?project=p1", {
        ...defaultStates,
        "tickets.get": querySuccess(buildTicket({ designId: some("d1") })),
      })

      await user.click(screen.getByRole("button", { name: /^edit$/i }))

      const designSelect = screen.getByLabelText(/design/i)
      await user.selectOptions(designSelect, "")
      await user.click(screen.getByRole("button", { name: /^save$/i }))

      expect(mockMutationFn).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketId: "t1",
          clearDesignId: true,
        }),
      )
    })
  })
})
