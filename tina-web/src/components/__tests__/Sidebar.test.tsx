import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Sidebar } from "../Sidebar"
import {
  buildOrchestrationSummary,
  buildProjectSummary,
  none,
  some,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import { expectStatusLabelVisible } from "@/test/harness/status"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

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

const defaultStates: Partial<QueryStateMap> = {
  "projects.list": querySuccess(defaultProjects),
  "orchestrations.list": querySuccess(defaultOrchestrations),
}

function renderSidebar({
  route = "/",
  states = {},
}: {
  route?: string
  states?: Partial<QueryStateMap>
} = {}) {
  return renderWithAppRuntime(<Sidebar />, {
    route,
    mockUseTypedQuery,
    states: { ...defaultStates, ...states },
  })
}

function itemContainer(label: string): HTMLElement {
  const labelNode = screen.getByText(label)
  const container = labelNode.closest("div")
  expect(container).toBeTruthy()
  return container as HTMLElement
}

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state while queries are pending", () => {
    const { container } = renderSidebar({
      states: {
        "projects.list": queryLoading(),
        "orchestrations.list": queryLoading(),
      },
    })

    expect(container.querySelectorAll('[class*="skeletonBar"]')).toHaveLength(4)
  })

  it("renders project tree with orchestrations grouped by project", () => {
    renderSidebar()

    for (const label of [
      "Project Alpha",
      "Project Beta",
      "feature-one",
      "feature-two",
      "feature-three",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("highlights selected orchestration and shows normalized status text", () => {
    const { container } = renderSidebar({
      route: "/?orch=o1",
      states: {
        "projects.list": querySuccess([
          buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 1 }),
        ]),
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

    expect(within(container).getByText("feature-one").closest("div")).toHaveClass("bg-muted/50")
    expectStatusLabelVisible("executing", container)
  })

  it("clicking an orchestration updates active selection styling", async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(itemContainer("feature-two"))

    expect(itemContainer("feature-two")).toHaveClass("bg-muted/50")
  })

  it("renders empty state when no orchestrations exist", () => {
    renderSidebar({
      states: {
        "projects.list": querySuccess([]),
        "orchestrations.list": querySuccess([]),
      },
    })

    expect(screen.getByText(/no orchestrations/i)).toBeInTheDocument()
  })

  it("groups orchestrations under ungrouped when projectId is none", () => {
    renderSidebar({
      states: {
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
