import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Option } from "effect"
import { RightPanel } from "../RightPanel"
import type { OrchestrationDetail } from "@/schemas"

// Mock hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery")
).useTypedQuery
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable

describe("RightPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
    })

    // Default mock for useTypedQuery (empty events)
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: [],
    })
  })

  const createMockDetail = (overrides?: Partial<OrchestrationDetail>): OrchestrationDetail => ({
    _id: "orch1",
    _creationTime: 1234567890,
    nodeId: "node1",
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
    nodeName: "test-node",
    phases: [],
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [],
    ...overrides,
  })

  it("renders all four sections", () => {
    const detail = createMockDetail()

    render(<RightPanel detail={detail} />)

    // Should render all section labels
    expect(screen.getByText("Status")).toBeInTheDocument()
    expect(screen.getAllByText("Team").length).toBeGreaterThan(0)
    expect(screen.getByText("Git")).toBeInTheDocument()
    expect(screen.getByText("Review")).toBeInTheDocument()
  })

  it("passes orchestration detail data to child sections", () => {
    const detail = createMockDetail({
      status: "reviewing",
      currentPhase: 2,
      totalPhases: 4,
    })

    render(<RightPanel detail={detail} />)

    // StatusSection should show the status
    expect(screen.getByText("reviewing")).toBeInTheDocument()
    // StatusSection should show phase progress
    expect(screen.getByText(/Phase 2\/4/i)).toBeInTheDocument()
  })

  it("handles empty state when no data available", () => {
    const detail = createMockDetail({
      teamMembers: [],
    })

    // Mock empty events for GitOps
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: [],
    })

    render(<RightPanel detail={detail} />)

    // GitOps should show empty state
    expect(screen.getByText(/no git activity/i)).toBeInTheDocument()
    // Review should show empty state
    expect(screen.getByText(/no review events/i)).toBeInTheDocument()
  })
})
