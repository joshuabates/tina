import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { OrchestrationPage } from "../OrchestrationPage"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import type { OrchestrationDetail } from "@/schemas"
import { Option } from "effect"

// Mock hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useSelection")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery")
).useTypedQuery
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection")
).useSelection

// Mock PhaseTimelinePanel
vi.mock("../PhaseTimelinePanel", () => ({
  PhaseTimelinePanel: ({ detail }: { detail: OrchestrationDetail }) => (
    <div data-testid="phase-timeline-panel">
      Phase Timeline for {detail.featureName}
    </div>
  ),
}))

// Mock TaskListPanel
vi.mock("../TaskListPanel", () => ({
  TaskListPanel: ({ detail }: { detail: OrchestrationDetail }) => (
    <div data-testid="task-list-panel">
      Task List for {detail.featureName}
    </div>
  ),
}))

// Mock RightPanel
vi.mock("../RightPanel", () => ({
  RightPanel: ({ detail }: { detail: OrchestrationDetail }) => (
    <div data-testid="right-panel">
      Right Panel for {detail.featureName}
    </div>
  ),
}))

const mockOrchestration: OrchestrationDetail = {
  _id: "o1",
  _creationTime: 1234567890,
  nodeId: "n1",
  featureName: "test-feature",
  designDocPath: "/docs/test.md",
  branch: "tina/test-feature",
  worktreePath: Option.none(),
  totalPhases: 3,
  currentPhase: 1,
  status: "executing",
  startedAt: "2024-01-01T10:00:00Z",
  completedAt: Option.none(),
  totalElapsedMins: Option.none(),
  nodeName: "node1",
  phases: [],
  tasks: [],
  orchestratorTasks: [],
  phaseTasks: {},
  teamMembers: [],
}

describe("OrchestrationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders empty state when no orchestration selected", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/select an orchestration from the sidebar/i)).toBeInTheDocument()
  })

  it("renders loading state while query pending", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    const { container } = render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    // Check for skeleton bars in loading state
    const skeletonBars = container.querySelectorAll('[class*="skeletonBar"]')
    expect(skeletonBars.length).toBeGreaterThan(0)
  })

  it("renders loading state with aria-busy attribute", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    const { container } = render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    const loadingElement = container.querySelector('[aria-busy="true"]')
    expect(loadingElement).toBeInTheDocument()
  })

  it("renders phase timeline when data loaded", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: mockOrchestration,
    } as TypedQueryResult<OrchestrationDetail>)

    render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId("phase-timeline-panel")).toBeInTheDocument()
    expect(screen.getByText(/Phase Timeline for test-feature/)).toBeInTheDocument()
  })

  it("renders both PhaseTimelinePanel and TaskListPanel when data loaded", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: mockOrchestration,
    } as TypedQueryResult<OrchestrationDetail>)

    render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId("phase-timeline-panel")).toBeInTheDocument()
    expect(screen.getByTestId("task-list-panel")).toBeInTheDocument()
  })

  it("shows orchestration feature name in header", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: mockOrchestration,
    } as TypedQueryResult<OrchestrationDetail>)

    const { container } = render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    // Check for header with both feature name and branch within this render
    expect(container.textContent).toContain("test-feature")
    expect(container.textContent).toContain("tina/test-feature")
  })

  it("throws to error boundary on query error", () => {
    // Suppress console.error for this test since we expect an error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    const error = new Error("Query failed")
    mockUseTypedQuery.mockReturnValue({
      status: "error",
      error,
    })

    const { container } = render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    // Error boundary should catch the error and render fallback
    expect(container.textContent).toContain("Unexpected error")
    expect(container.textContent).toContain("Something went wrong in orchestration")

    consoleSpy.mockRestore()
  })

  it("shows not-found state when OrchestrationDetailQuery returns null", () => {
    // Suppress console.error for this test since we expect an error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: null,
    } as TypedQueryResult<OrchestrationDetail | null>)

    const { container } = render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    // Error boundary should catch the NotFoundError and render fallback
    expect(container.textContent).toContain("orchestration not found")

    consoleSpy.mockRestore()
  })

  it("resets error boundary when selected orchestration changes", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: null,
    } as TypedQueryResult<OrchestrationDetail | null>)

    const { rerender, container } = render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    expect(container.textContent).toContain("orchestration not found")

    mockUseSelection.mockReturnValue({
      orchestrationId: "o2",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: {
        ...mockOrchestration,
        _id: "o2",
        featureName: "next-feature",
        branch: "tina/next-feature",
      },
    } as TypedQueryResult<OrchestrationDetail>)

    rerender(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId("phase-timeline-panel")).toBeInTheDocument()
    expect(screen.getByText(/Phase Timeline for next-feature/)).toBeInTheDocument()
    expect(screen.getByTestId("task-list-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-panel")).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it("renders RightPanel when data loaded", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: mockOrchestration,
    } as TypedQueryResult<OrchestrationDetail>)

    render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    expect(screen.getByTestId("right-panel")).toBeInTheDocument()
    expect(screen.getByText(/Right Panel for test-feature/)).toBeInTheDocument()
  })

  it("renders all three panels in 3-column layout when data loaded", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: mockOrchestration,
    } as TypedQueryResult<OrchestrationDetail>)

    render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    // All three panels should be present
    expect(screen.getByTestId("phase-timeline-panel")).toBeInTheDocument()
    expect(screen.getByTestId("task-list-panel")).toBeInTheDocument()
    expect(screen.getByTestId("right-panel")).toBeInTheDocument()
  })

  it("has aria-live region for status changes", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "o1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: mockOrchestration,
    } as TypedQueryResult<OrchestrationDetail>)

    const { container } = render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    // Should have an aria-live="polite" region for status updates
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeInTheDocument()
    expect(liveRegion).toHaveAttribute("aria-atomic", "true")
  })
})
