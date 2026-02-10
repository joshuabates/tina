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

    // Check for header with both feature name and branch
    const titles = container.querySelectorAll('[class*="title"]')
    expect(titles.length).toBeGreaterThan(0)
    expect(Array.from(titles).some(el => el.textContent === "test-feature")).toBe(true)

    const subtitles = screen.getAllByText("tina/test-feature")
    expect(subtitles.length).toBeGreaterThan(0)
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

    render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    // Error boundary should catch the error and render fallback
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()

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

    render(
      <MemoryRouter>
        <OrchestrationPage />
      </MemoryRouter>
    )

    // Error boundary should catch the NotFoundError and render fallback
    const alerts = screen.getAllByRole("alert")
    expect(alerts.length).toBeGreaterThan(0)

    const notFoundMessages = screen.getAllByText(/orchestration not found/i)
    expect(notFoundMessages.length).toBeGreaterThan(0)

    consoleSpy.mockRestore()
  })
})
