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

const designs: DesignSummary[] = [
  buildDesignSummary({
    _id: "d1",
    designKey: "ALPHA-D1",
    title: "Authentication Flow",
    status: "draft",
    updatedAt: "2024-01-01T12:00:00Z",
  }),
  buildDesignSummary({
    _id: "d2",
    _creationTime: 1234567891,
    designKey: "ALPHA-D2",
    title: "Data Model",
    status: "approved",
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

describe("DesignListPage", () => {
  it("renders loading state when query is loading", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1", {
      ...defaultStates,
      "designs.list": queryLoading(),
    })

    await user.click(screen.getByRole("tab", { name: /designs/i }))

    expect(screen.getByTestId("design-list-page")).toBeInTheDocument()
    expect(screen.getByTestId("design-list-loading")).toBeInTheDocument()
  })

  it("renders empty state when no designs exist", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1", {
      ...defaultStates,
      "designs.list": querySuccess([]),
    })

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    expect(screen.getByText(/no designs/i)).toBeInTheDocument()
  })

  it("renders table with design rows when designs exist", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    const table = screen.getByRole("table")
    expect(table).toBeInTheDocument()

    const rows = within(table).getAllByRole("row")
    // header row + 2 data rows
    expect(rows).toHaveLength(3)
  })

  it("displays design key and title", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    expect(screen.getByText("ALPHA-D1")).toBeInTheDocument()
    expect(screen.getByText("Authentication Flow")).toBeInTheDocument()
    expect(screen.getByText("ALPHA-D2")).toBeInTheDocument()
    expect(screen.getByText("Data Model")).toBeInTheDocument()
  })

  it("renders status badges for each design", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    // StatusBadge renders status labels
    expect(screen.getByText("Draft")).toBeInTheDocument()
    expect(screen.getByText("Approved")).toBeInTheDocument()
  })

  it("clicking a design row navigates to detail page", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    const rows = screen.getAllByRole("row")
    // Click the first data row (skip header)
    await user.click(rows[1])

    expect(screen.getByTestId("design-detail-page")).toBeInTheDocument()
  })

  it("shows create design button", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    expect(screen.getByRole("button", { name: /create design/i })).toBeInTheDocument()
  })

  it("shows no project selected message when no project param", () => {
    renderApp("/pm")

    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })

  it("treats an empty project param as no project and skips invalid ID args", () => {
    renderApp("/pm?project=")

    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })

  it("renders page title", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    expect(screen.getByRole("heading", { name: "Designs" })).toBeInTheDocument()
  })

  describe("create form", () => {
    it("toggles create form when clicking Create Design button", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      expect(screen.queryByTestId("design-create-form")).not.toBeInTheDocument()

      await user.click(screen.getByRole("button", { name: /create design/i }))

      expect(screen.getByTestId("design-create-form")).toBeInTheDocument()
    })

    it("shows title input and markdown textarea", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      await user.click(screen.getByRole("button", { name: /create design/i }))

      const form = screen.getByTestId("design-create-form")
      const titleInput = within(form).getByLabelText(/title/i)
      expect(titleInput).toBeInTheDocument()
      expect(titleInput).toHaveAttribute("type", "text")

      const markdownTextarea = within(form).getByLabelText(/content/i)
      expect(markdownTextarea).toBeInTheDocument()
      expect(markdownTextarea.tagName).toBe("TEXTAREA")
    })

    it("disables submit when title is empty", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      await user.click(screen.getByRole("button", { name: /create design/i }))

      const form = screen.getByTestId("design-create-form")
      const submitButton = within(form).getByRole("button", { name: /create/i })
      expect(submitButton).toBeDisabled()
    })

    it("enables submit when title is provided", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      await user.click(screen.getByRole("button", { name: /create design/i }))

      const form = screen.getByTestId("design-create-form")
      const titleInput = within(form).getByLabelText(/title/i)
      await user.type(titleInput, "New Design")

      const submitButton = within(form).getByRole("button", { name: /create/i })
      expect(submitButton).toBeEnabled()
    })

    it("hides form when clicking Cancel", async () => {
      const user = userEvent.setup()
      renderApp("/pm?project=p1")

      await user.click(screen.getByRole("tab", { name: /designs/i }))
      await user.click(screen.getByRole("button", { name: /create design/i }))
      expect(screen.getByTestId("design-create-form")).toBeInTheDocument()

      const form = screen.getByTestId("design-create-form")
      await user.click(within(form).getByRole("button", { name: /cancel/i }))

      expect(screen.queryByTestId("design-create-form")).not.toBeInTheDocument()
    })
  })
})
