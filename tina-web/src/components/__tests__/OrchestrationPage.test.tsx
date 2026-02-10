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

    render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
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
    expect(container.textContent).toContain("Unexpected error in orchestration")

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
})
