import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  buildSpecSummary,
  some,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import type { SpecSummary } from "@/schemas"

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

const specs: SpecSummary[] = [
  buildSpecSummary({
    _id: "d1",
    specKey: "ALPHA-D1",
    title: "Authentication Flow",
    status: "draft",
    updatedAt: "2024-01-01T12:00:00Z",
  }),
  buildSpecSummary({
    _id: "d2",
    _creationTime: 1234567891,
    specKey: "ALPHA-D2",
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
  "specs.list": querySuccess(specs),
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

describe("SpecListPage", () => {
  it("renders loading state when query is loading", () => {
    renderApp("/projects/p1/plan/specs", {
      ...defaultStates,
      "specs.list": queryLoading(),
    })

    expect(screen.getByTestId("spec-list-page")).toBeInTheDocument()
    expect(screen.getByTestId("spec-list-loading")).toBeInTheDocument()
  })

  it("renders empty state when no specs exist", () => {
    renderApp("/projects/p1/plan/specs", {
      ...defaultStates,
      "specs.list": querySuccess([]),
    })

    expect(screen.getByText(/no specs/i)).toBeInTheDocument()
  })

  it("renders table with spec rows when specs exist", () => {
    renderApp("/projects/p1/plan/specs")

    const table = screen.getByRole("table")
    expect(table).toBeInTheDocument()

    const rows = within(table).getAllByRole("row")
    expect(rows).toHaveLength(3)
  })

  it("displays spec key and title", () => {
    renderApp("/projects/p1/plan/specs")

    expect(screen.getByText("ALPHA-D1")).toBeInTheDocument()
    expect(screen.getByText("Authentication Flow")).toBeInTheDocument()
    expect(screen.getByText("ALPHA-D2")).toBeInTheDocument()
    expect(screen.getByText("Data Model")).toBeInTheDocument()
  })

  it("renders status badges for each spec", () => {
    renderApp("/projects/p1/plan/specs")
    expect(screen.getByText("Draft")).toBeInTheDocument()
    expect(screen.getByText("Approved")).toBeInTheDocument()
  })

  it("clicking a spec row navigates to detail page", async () => {
    const user = userEvent.setup()
    renderApp("/projects/p1/plan/specs")

    const rows = screen.getAllByRole("row")
    await user.click(rows[1])

    expect(screen.getByTestId("spec-detail-page")).toBeInTheDocument()
  })

  it("shows create spec button", () => {
    renderApp("/projects/p1/plan/specs")
    expect(screen.getByRole("button", { name: /create spec/i })).toBeInTheDocument()
  })

  it("renders page title", () => {
    renderApp("/projects/p1/plan/specs")
    expect(screen.getByRole("heading", { name: "Specs" })).toBeInTheDocument()
  })

  describe("create form modal", () => {
    it("opens modal when Create Spec button is clicked", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/specs")

      await user.click(screen.getByRole("button", { name: /create spec/i }))

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(within(dialog).getByText("Create Spec")).toBeInTheDocument()
    })

    it("shows title and content inputs in modal", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/specs")

      await user.click(screen.getByRole("button", { name: /create spec/i }))

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getByLabelText(/title/i)).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/content/i)).toBeInTheDocument()
    })

    it("submit button disabled when title is empty", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/specs")

      await user.click(screen.getByRole("button", { name: /create spec/i }))

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getByRole("button", { name: /^create$/i })).toBeDisabled()
    })

    it("closes modal on cancel", async () => {
      const user = userEvent.setup()
      renderApp("/projects/p1/plan/specs")

      await user.click(screen.getByRole("button", { name: /create spec/i }))
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancel/i }))
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })
})
