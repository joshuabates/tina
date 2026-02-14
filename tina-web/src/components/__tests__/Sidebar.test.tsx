import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Sidebar } from "../Sidebar"
import { api } from "@convex/_generated/api"
import {
  buildOrchestrationDetail,
  buildOrchestrationSummary,
  buildPhase,
  some,
} from "@/test/builders/domain"
import { queryLoading, querySuccess, type QueryStateMap } from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import { statusTextClass, toStatusBadgeStatus } from "@/components/ui/status-styles"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/convex", () => ({
  convex: {
    mutation: vi.fn(),
  },
}))

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery
const mockConvexMutation = vi.mocked(
  (await import("@/convex")).convex.mutation as any,
)

const defaultOrchestrations = [
  buildOrchestrationSummary({
    _id: "o1",
    featureName: "feature-one",
    projectId: some("p1"),
    status: "executing",
  }),
  buildOrchestrationSummary({
    _id: "o2",
    _creationTime: 1234567891,
    featureName: "feature-two",
    projectId: some("p1"),
    status: "complete",
  }),
  buildOrchestrationSummary({
    _id: "o3",
    _creationTime: 1234567892,
    featureName: "feature-three",
    projectId: some("p2"),
    status: "blocked",
  }),
]

const defaultStates: Partial<QueryStateMap> = {
  "orchestrations.list": querySuccess(defaultOrchestrations),
}

function renderSidebar({
  route = "/projects/p1/observe",
  states = {},
  detailResults = {},
  projectId = "p1",
}: {
  route?: string
  states?: Partial<QueryStateMap>
  detailResults?: Record<string, ReturnType<typeof querySuccess<unknown>>>
  projectId?: string
} = {}) {
  return renderWithAppRuntime(<Sidebar projectId={projectId} />, {
    route,
    mockUseTypedQuery,
    states: { ...defaultStates, ...states },
    detailResults,
  })
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConvexMutation.mockResolvedValue({ done: true } as any)
  })

  it("renders loading state while query is pending", () => {
    const { container } = renderSidebar({
      states: {
        "orchestrations.list": queryLoading(),
      },
    })

    expect(container.querySelectorAll('[class*="skeletonBar"]')).toHaveLength(4)
  })

  it("renders only orchestrations scoped to the current project", () => {
    renderSidebar()

    expect(screen.getByText("feature-one")).toBeInTheDocument()
    expect(screen.getByText("feature-two")).toBeInTheDocument()
    expect(screen.queryByText("feature-three")).not.toBeInTheDocument()
  })

  it("highlights selected orchestration and shows status indicator", () => {
    const { container } = renderSidebar({
      route: "/projects/p1/observe?orch=o1",
      states: {
        "orchestrations.list": querySuccess([
          buildOrchestrationSummary({
            _id: "o1",
            featureName: "feature-one",
            projectId: some("p1"),
            status: "executing",
          }),
        ]),
      },
    })

    const item = within(container).getByText("feature-one").closest("div")
    expect(item).toHaveClass("bg-muted/50")

    const statusIcon = item?.querySelector("span[data-status-indicator] svg")
    expect(statusIcon).toBeTruthy()
    const expectedStatusClass = statusTextClass(toStatusBadgeStatus("executing"))
    expect(statusIcon).toHaveClass(expectedStatusClass)
  })

  it("clicking an orchestration updates active selection styling", async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByText("feature-two"))

    expect(screen.getByText("feature-two").closest("div")).toHaveClass("bg-muted/50")
  })

  it("clicking orchestration delete calls deleteOrchestration", async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(
      screen.getByRole("button", {
        name: /delete orchestration feature-two/i,
      }),
    )

    expect(mockConvexMutation).toHaveBeenCalledWith(
      api.orchestrations.deleteOrchestration,
      {
        orchestrationId: "o2",
      },
    )
  })

  it("expands selected orchestration phases in the sidebar", () => {
    renderSidebar({
      route: "/projects/p1/observe?orch=o1",
      detailResults: {
        o1: querySuccess(
          buildOrchestrationDetail({
            _id: "o1",
            featureName: "feature-one",
            phases: [
              buildPhase({ _id: "phase1", phaseNumber: "1", status: "executing" }),
              buildPhase({ _id: "phase2", phaseNumber: "2", status: "planning" }),
            ],
            phaseTasks: { "1": [], "2": [] },
            teamMembers: [],
          }),
        ),
      },
    })

    expect(screen.getByRole("button", { name: /phase 1/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /phase 2/i })).toBeInTheDocument()
  })

  it("renders selected phase with vertical line indicator", () => {
    const { container } = renderSidebar({
      route: "/projects/p1/observe?orch=o1&phase=phase2",
      detailResults: {
        o1: querySuccess(
          buildOrchestrationDetail({
            _id: "o1",
            featureName: "feature-one",
            phases: [
              buildPhase({ _id: "phase1", phaseNumber: "1", status: "executing" }),
              buildPhase({ _id: "phase2", phaseNumber: "2", status: "planning" }),
            ],
            phaseTasks: { "1": [], "2": [] },
            teamMembers: [],
          }),
        ),
      },
    })

    const selectedPhaseIndicator = container.querySelector(
      '[data-phase-id="phase2"] [data-phase-indicator]',
    )
    expect(selectedPhaseIndicator).toHaveAttribute("data-phase-indicator", "line")
  })

  it("renders empty state when project has no orchestrations", () => {
    renderSidebar({
      states: {
        "orchestrations.list": querySuccess([]),
      },
    })

    expect(screen.getByText(/no orchestrations for this project/i)).toBeInTheDocument()
  })
})
