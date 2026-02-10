import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { Option } from "effect"
import { Sidebar } from "../Sidebar"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import type { ProjectSummary, OrchestrationSummary } from "@/schemas"

// Mock hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery")
).useTypedQuery
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection")
).useSelection

describe("Sidebar", () => {
  const mockSelectOrchestration = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
    })

    // Default mock for useSelection
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: vi.fn(),
    })
  })

  it("renders loading state while queries are pending", () => {
    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("renders project tree with orchestrations grouped by project", () => {
    const projects: ProjectSummary[] = [
      {
        _id: "p1",
        _creationTime: 1234567890,
        name: "Project Alpha",
        repoPath: "/path/to/alpha",
        createdAt: "2024-01-01T00:00:00Z",
        orchestrationCount: 2,
        latestFeature: null,
        latestStatus: null,
      },
      {
        _id: "p2",
        _creationTime: 1234567891,
        name: "Project Beta",
        repoPath: "/path/to/beta",
        createdAt: "2024-01-02T00:00:00Z",
        orchestrationCount: 1,
        latestFeature: null,
        latestStatus: null,
      },
    ]

    const orchestrations: OrchestrationSummary[] = [
      {
        _id: "o1",
        _creationTime: 1234567890,
        nodeId: "n1",
        projectId: Option.some("p1"),
        featureName: "feature-one",
        designDocPath: "/docs/feature-one.md",
        branch: "tina/feature-one",
        worktreePath: Option.none(),
        totalPhases: 3,
        currentPhase: 1,
        status: "executing",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: Option.none(),
        totalElapsedMins: Option.none(),
        nodeName: "node1",
      },
      {
        _id: "o2",
        _creationTime: 1234567891,
        nodeId: "n1",
        projectId: Option.some("p1"),
        featureName: "feature-two",
        designDocPath: "/docs/feature-two.md",
        branch: "tina/feature-two",
        worktreePath: Option.none(),
        totalPhases: 2,
        currentPhase: 2,
        status: "complete",
        startedAt: "2024-01-02T10:00:00Z",
        completedAt: Option.some("2024-01-02T11:00:00Z"),
        totalElapsedMins: Option.some(60),
        nodeName: "node1",
      },
      {
        _id: "o3",
        _creationTime: 1234567892,
        nodeId: "n1",
        projectId: Option.some("p2"),
        featureName: "feature-three",
        designDocPath: "/docs/feature-three.md",
        branch: "tina/feature-three",
        worktreePath: Option.none(),
        totalPhases: 1,
        currentPhase: 1,
        status: "blocked",
        startedAt: "2024-01-03T10:00:00Z",
        completedAt: Option.none(),
        totalElapsedMins: Option.none(),
        nodeName: "node1",
      },
    ]

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return { status: "success", data: orchestrations } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })

    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.getByText("Project Alpha")).toBeInTheDocument()
    expect(screen.getByText("Project Beta")).toBeInTheDocument()
    expect(screen.getByText("feature-one")).toBeInTheDocument()
    expect(screen.getByText("feature-two")).toBeInTheDocument()
    expect(screen.getByText("feature-three")).toBeInTheDocument()
  })

  it("highlights selected orchestration", () => {
    const projects: ProjectSummary[] = [
      {
        _id: "p1",
        _creationTime: 1234567890,
        name: "Project Alpha",
        repoPath: "/path/to/alpha",
        createdAt: "2024-01-01T00:00:00Z",
        orchestrationCount: 1,
        latestFeature: null,
        latestStatus: null,
      },
    ]

    const orchestrations: OrchestrationSummary[] = [
      {
        _id: "o1",
        _creationTime: 1234567890,
        nodeId: "n1",
        projectId: Option.some("p1"),
        featureName: "feature-one",
        designDocPath: "/docs/feature-one.md",
        branch: "tina/feature-one",
        worktreePath: Option.none(),
        totalPhases: 3,
        currentPhase: 1,
        status: "executing",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: Option.none(),
        totalElapsedMins: Option.none(),
        nodeName: "node1",
      },
    ]

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return { status: "success", data: orchestrations } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })

    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: vi.fn(),
    })

    const { container } = render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    // Find the orchestration item and check if it has the active class
    const orchestrationItem = within(container).getByText("feature-one")
    const itemContainer = orchestrationItem.closest("div")
    expect(itemContainer).toHaveClass("bg-muted/50")
  })

  it("calls selectOrchestration when clicking an orchestration", async () => {
    const user = userEvent.setup()

    const projects: ProjectSummary[] = [
      {
        _id: "p1",
        _creationTime: 1234567890,
        name: "Project Alpha",
        repoPath: "/path/to/alpha",
        createdAt: "2024-01-01T00:00:00Z",
        orchestrationCount: 1,
        latestFeature: null,
        latestStatus: null,
      },
    ]

    const orchestrations: OrchestrationSummary[] = [
      {
        _id: "o1",
        _creationTime: 1234567890,
        nodeId: "n1",
        projectId: Option.some("p1"),
        featureName: "feature-one",
        designDocPath: "/docs/feature-one.md",
        branch: "tina/feature-one",
        worktreePath: Option.none(),
        totalPhases: 3,
        currentPhase: 1,
        status: "executing",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: Option.none(),
        totalElapsedMins: Option.none(),
        nodeName: "node1",
      },
    ]

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return { status: "success", data: orchestrations } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })

    const { container } = render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    const orchestrationItem = within(container).getByText("feature-one")
    await user.click(orchestrationItem)

    expect(mockSelectOrchestration).toHaveBeenCalledWith("o1")
  })

  it("shows normalized status text", () => {
    const projects: ProjectSummary[] = [
      {
        _id: "p1",
        _creationTime: 1234567890,
        name: "Project Alpha",
        repoPath: "/path/to/alpha",
        createdAt: "2024-01-01T00:00:00Z",
        orchestrationCount: 1,
        latestFeature: null,
        latestStatus: null,
      },
    ]

    const orchestrations: OrchestrationSummary[] = [
      {
        _id: "o1",
        _creationTime: 1234567890,
        nodeId: "n1",
        projectId: Option.some("p1"),
        featureName: "feature-one",
        designDocPath: "/docs/feature-one.md",
        branch: "tina/feature-one",
        worktreePath: Option.none(),
        totalPhases: 3,
        currentPhase: 1,
        status: "executing",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: Option.none(),
        totalElapsedMins: Option.none(),
        nodeName: "node1",
      },
    ]

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return { status: "success", data: orchestrations } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })

    const { container } = render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(within(container).getByText("Executing")).toBeInTheDocument()
  })

  it("renders empty state when no orchestrations exist", () => {
    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: [] } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return { status: "success", data: [] } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })

    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.getByText(/no orchestrations/i)).toBeInTheDocument()
  })

  it("registers focus section with correct item count", () => {
    const projects: ProjectSummary[] = [
      {
        _id: "p1",
        _creationTime: 1234567890,
        name: "Project Alpha",
        repoPath: "/path/to/alpha",
        createdAt: "2024-01-01T00:00:00Z",
        orchestrationCount: 2,
        latestFeature: null,
        latestStatus: null,
      },
    ]

    const orchestrations: OrchestrationSummary[] = [
      {
        _id: "o1",
        _creationTime: 1234567890,
        nodeId: "n1",
        projectId: Option.some("p1"),
        featureName: "feature-one",
        designDocPath: "/docs/feature-one.md",
        branch: "tina/feature-one",
        worktreePath: Option.none(),
        totalPhases: 3,
        currentPhase: 1,
        status: "executing",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: Option.none(),
        totalElapsedMins: Option.none(),
        nodeName: "node1",
      },
      {
        _id: "o2",
        _creationTime: 1234567891,
        nodeId: "n1",
        projectId: Option.some("p1"),
        featureName: "feature-two",
        designDocPath: "/docs/feature-two.md",
        branch: "tina/feature-two",
        worktreePath: Option.none(),
        totalPhases: 2,
        currentPhase: 2,
        status: "complete",
        startedAt: "2024-01-02T10:00:00Z",
        completedAt: Option.some("2024-01-02T11:00:00Z"),
        totalElapsedMins: Option.some(60),
        nodeName: "node1",
      },
    ]

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return { status: "success", data: orchestrations } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })

    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(mockUseFocusable).toHaveBeenCalledWith("sidebar", 2)
  })

  it("groups orchestrations under ungrouped when projectId is none", () => {
    const projects: ProjectSummary[] = []

    const orchestrations: OrchestrationSummary[] = [
      {
        _id: "o1",
        _creationTime: 1234567890,
        nodeId: "n1",
        projectId: Option.none(),
        featureName: "ungrouped-feature",
        designDocPath: "/docs/ungrouped.md",
        branch: "tina/ungrouped",
        worktreePath: Option.none(),
        totalPhases: 1,
        currentPhase: 1,
        status: "planning",
        startedAt: "2024-01-01T10:00:00Z",
        completedAt: Option.none(),
        totalElapsedMins: Option.none(),
        nodeName: "node1",
      },
    ]

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return { status: "success", data: orchestrations } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })

    render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    expect(screen.getByText("Ungrouped")).toBeInTheDocument()
    expect(screen.getByText("ungrouped-feature")).toBeInTheDocument()
  })
})
