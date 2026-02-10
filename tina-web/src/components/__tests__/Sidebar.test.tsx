import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { Sidebar } from "../Sidebar"
import {
  buildOrchestrationSummary,
  buildProjectSummary,
  none,
  some,
} from "@/test/builders/domain"
import {
  queryLoading,
  queryStateFor,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import {
  focusableState,
  selectionState,
  type SelectionStateMock,
} from "@/test/harness/hooks"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection

const mockSelectOrchestration = vi.fn()

const defaultProjects = [
  buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 2 }),
  buildProjectSummary({ _id: "p2", name: "Project Beta", orchestrationCount: 1 }),
]

const defaultOrchestrations = [
  buildOrchestrationSummary({ _id: "o1", featureName: "feature-one", projectId: some("p1") }),
  buildOrchestrationSummary({
    _id: "o2",
    _creationTime: 1234567891,
    featureName: "feature-two",
    projectId: some("p1"),
    status: "complete",
    completedAt: some("2024-01-02T11:00:00Z"),
    totalElapsedMins: some(60),
  }),
  buildOrchestrationSummary({
    _id: "o3",
    _creationTime: 1234567892,
    featureName: "feature-three",
    projectId: some("p2"),
    status: "blocked",
  }),
]

function singleQueries(
  overrides: Parameters<typeof buildOrchestrationSummary>[0] = {},
): Partial<QueryStateMap> {
  return {
    "projects.list": querySuccess([
      buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 1 }),
    ]),
    "orchestrations.list": querySuccess([
      buildOrchestrationSummary({
        _id: "o1",
        featureName: "feature-one",
        projectId: some("p1"),
        ...overrides,
      }),
    ]),
  }
}

function renderSidebar({
  queries,
  selection,
}: {
  queries?: Partial<QueryStateMap>
  selection?: Partial<SelectionStateMock>
} = {}) {
  const states: QueryStateMap = {
    "projects.list": querySuccess(defaultProjects),
    "orchestrations.list": querySuccess(defaultOrchestrations),
    ...queries,
  }

  mockUseTypedQuery.mockImplementation((def) => queryStateFor(def.key, states))
  mockUseSelection.mockReturnValue(
    selectionState({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: vi.fn(),
      ...selection,
    }),
  )

  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseFocusable.mockReturnValue(focusableState())
  })

  it("renders loading state while queries are pending", () => {
    const { container } = renderSidebar({
      queries: {
        "projects.list": queryLoading(),
        "orchestrations.list": queryLoading(),
      },
    })

    expect(container.querySelectorAll('[class*="skeletonBar"]')).toHaveLength(4)
  })

  it("renders project tree with orchestrations grouped by project", () => {
    renderSidebar()

    for (const label of ["Project Alpha", "Project Beta", "feature-one", "feature-two", "feature-three"]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("highlights selected orchestration and shows normalized status text", () => {
    const { container } = renderSidebar({
      queries: singleQueries(),
      selection: { orchestrationId: "o1" },
    })

    expect(within(container).getByText("feature-one").closest("div")).toHaveClass("bg-muted/50")
    expect(within(container).getByText("Executing")).toBeInTheDocument()
  })

  it("calls selectOrchestration when clicking an orchestration", async () => {
    const user = userEvent.setup()
    const { container } = renderSidebar({ queries: singleQueries() })

    await user.click(within(container).getByText("feature-one"))

    expect(mockSelectOrchestration).toHaveBeenCalledWith("o1")
  })

  it("renders empty state when no orchestrations exist", () => {
    renderSidebar({
      queries: {
        "projects.list": querySuccess([]),
        "orchestrations.list": querySuccess([]),
      },
    })

    expect(screen.getByText(/no orchestrations/i)).toBeInTheDocument()
  })

  it("registers focus section with correct item count", () => {
    renderSidebar()
    expect(mockUseFocusable).toHaveBeenCalledWith("sidebar", 3)
  })

  it("groups orchestrations under ungrouped when projectId is none", () => {
    renderSidebar({
      queries: {
        "projects.list": querySuccess([]),
        "orchestrations.list": querySuccess([
          buildOrchestrationSummary({
            _id: "o1",
            featureName: "ungrouped-feature",
            projectId: none(),
            status: "planning",
            branch: "tina/ungrouped",
            designDocPath: "/docs/ungrouped.md",
          }),
        ]),
      },
    })

    expect(screen.getByText("Ungrouped")).toBeInTheDocument()
    expect(screen.getByText("ungrouped-feature")).toBeInTheDocument()
  })
})
