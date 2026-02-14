import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  buildDesignSummary,
  some,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
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

const designs: DesignSummary[] = [
  buildDesignSummary({
    _id: "des1",
    designKey: "ALPHA-DES1",
    title: "Login Page Design",
    status: "exploring",
    updatedAt: "2024-01-01T12:00:00Z",
  }),
  buildDesignSummary({
    _id: "des2",
    _creationTime: 1234567891,
    designKey: "ALPHA-DES2",
    title: "Dashboard Layout",
    status: "locked",
    updatedAt: "2024-01-02T14:00:00Z",
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
  "designs.list": querySuccess(designs),
}

function renderApp(
  route: string,
  states: Partial<QueryStateMap> = defaultStates,
) {
  return renderWithAppRuntime(<App />, {
    route,
    mockUseTypedQuery,
    states,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("DesignListPage", () => {
  it("renders loading state when query is loading", () => {
    renderApp("/projects/p1/plan/designs", {
      ...defaultStates,
      "designs.list": queryLoading(),
    })

    expect(screen.getByTestId("design-list-page")).toBeInTheDocument()
    expect(screen.getByTestId("design-list-loading")).toBeInTheDocument()
  })

  it("renders empty state when no designs exist", () => {
    renderApp("/projects/p1/plan/designs", {
      ...defaultStates,
      "designs.list": querySuccess([]),
    })

    expect(screen.getByText(/no designs/i)).toBeInTheDocument()
  })

  it("renders table with design rows when designs exist", () => {
    renderApp("/projects/p1/plan/designs")

    const table = screen.getByRole("table")
    expect(table).toBeInTheDocument()

    const rows = within(table).getAllByRole("row")
    expect(rows).toHaveLength(3)
  })

  it("displays design key and title", () => {
    renderApp("/projects/p1/plan/designs")

    expect(screen.getByText("ALPHA-DES1")).toBeInTheDocument()
    expect(screen.getByText("Login Page Design")).toBeInTheDocument()
    expect(screen.getByText("ALPHA-DES2")).toBeInTheDocument()
    expect(screen.getByText("Dashboard Layout")).toBeInTheDocument()
  })

  it("renders status badges for each design", () => {
    renderApp("/projects/p1/plan/designs")
    // Both "exploring" and "locked" are unmapped statuses that fall back to "Planning"
    const badges = screen.getAllByText("Planning")
    expect(badges).toHaveLength(2)
  })

  it("clicking a design row navigates to detail page", async () => {
    const user = userEvent.setup()
    renderApp("/projects/p1/plan/designs")

    const rows = screen.getAllByRole("row")
    await user.click(rows[1])

    expect(screen.getByTestId("design-detail-page")).toBeInTheDocument()
  })

  it("shows create design button", () => {
    renderApp("/projects/p1/plan/designs")
    expect(screen.getByRole("button", { name: /create design/i })).toBeInTheDocument()
  })

  it("does not render Designs subheading", () => {
    renderApp("/projects/p1/plan/designs")
    expect(screen.queryByRole("heading", { name: "Designs" })).not.toBeInTheDocument()
  })

  it("renders list-view toggle with Designs active", () => {
    renderApp("/projects/p1/plan/designs")

    const toggle = screen.getByRole("navigation", { name: /plan list view toggle/i })
    expect(toggle).toBeInTheDocument()

    const ticketsLink = within(toggle).getByRole("link", { name: "Tickets" })
    const designsLink = within(toggle).getByRole("link", { name: "Designs" })

    expect(designsLink).toHaveAttribute("aria-current", "page")
    expect(ticketsLink).not.toHaveAttribute("aria-current")
  })

  it("navigates to tickets list when toggle is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/projects/p1/plan/designs")

    await user.click(screen.getByRole("link", { name: "Tickets" }))
    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })

  describe("create form modal", () => {
    it("opens modal when Create Design button is clicked", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/designs")

      await user.click(screen.getByRole("button", { name: /create design/i }))

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(within(dialog).getByText("Create Design")).toBeInTheDocument()
    })

    it("shows title and prompt inputs in modal", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/designs")

      await user.click(screen.getByRole("button", { name: /create design/i }))

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getByLabelText(/title/i)).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/prompt/i)).toBeInTheDocument()
    })

    it("submit button disabled when title is empty", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/designs")

      await user.click(screen.getByRole("button", { name: /create design/i }))

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getByRole("button", { name: /^create$/i })).toBeDisabled()
    })

    it("closes modal on cancel", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/designs")

      await user.click(screen.getByRole("button", { name: /create design/i }))
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancel/i }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })
})
