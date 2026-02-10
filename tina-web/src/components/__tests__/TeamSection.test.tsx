import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Option } from "effect"
import { TeamSection } from "../TeamSection"
import type { OrchestrationDetail } from "@/schemas"

// Mock hooks
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable

describe("TeamSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
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
    phases: [
      {
        _id: "phase1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: "1",
        status: "executing",
        planPath: Option.some("/path/to/plan1.md"),
        gitRange: Option.none(),
        planningMins: Option.some(10),
        executionMins: Option.some(20),
        reviewMins: Option.none(),
        startedAt: Option.some("2024-01-01T10:00:00Z"),
        completedAt: Option.none(),
      },
    ],
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [
      {
        _id: "member1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: "1",
        agentName: "worker1",
        agentType: Option.some("implementer"),
        model: Option.some("sonnet"),
        joinedAt: Option.some("2024-01-01T10:00:00Z"),
        recordedAt: "2024-01-01T10:00:00Z",
      },
      {
        _id: "member2",
        _creationTime: 1234567891,
        orchestrationId: "orch1",
        phaseNumber: "1",
        agentName: "worker2",
        agentType: Option.some("reviewer"),
        model: Option.some("sonnet"),
        joinedAt: Option.some("2024-01-01T10:05:00Z"),
        recordedAt: "2024-01-01T10:05:00Z",
      },
    ],
    ...overrides,
  })

  it("renders team members with correct names", () => {
    const detail = createMockDetail()

    render(<TeamSection detail={detail} />)

    expect(screen.getByText("worker1")).toBeInTheDocument()
    expect(screen.getByText("worker2")).toBeInTheDocument()
  })

  it("handles empty team members array", () => {
    const detail = createMockDetail({
      teamMembers: [],
    })

    const { container } = render(<TeamSection detail={detail} />)

    // Should still render the team panel, just with no members
    // TeamPanelUI will show "0 ACTIVE"
    expect(container).toBeInTheDocument()
  })

  it("maps agent data to memberStatus correctly - active for current phase", () => {
    const detail = createMockDetail({
      currentPhase: 1,
      teamMembers: [
        {
          _id: "member1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: "1", // Matches current phase
          agentName: "worker1",
          agentType: Option.some("implementer"),
          model: Option.some("sonnet"),
          joinedAt: Option.some("2024-01-01T10:00:00Z"),
          recordedAt: "2024-01-01T10:00:00Z",
        },
      ],
    })

    render(<TeamSection detail={detail} />)

    // Should show ACTIVE status
    expect(screen.getByText("ACTIVE")).toBeInTheDocument()
  })

  it("maps agent data to memberStatus correctly - idle for non-current phase", () => {
    const detail = createMockDetail({
      currentPhase: 2,
      teamMembers: [
        {
          _id: "member1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: "1", // Does not match current phase (2)
          agentName: "worker1",
          agentType: Option.some("implementer"),
          model: Option.some("sonnet"),
          joinedAt: Option.some("2024-01-01T10:00:00Z"),
          recordedAt: "2024-01-01T10:00:00Z",
        },
      ],
    })

    render(<TeamSection detail={detail} />)

    // Should show IDLE status
    expect(screen.getByText("IDLE")).toBeInTheDocument()
  })

  it("registers rightPanel.team focus section", () => {
    const detail = createMockDetail()

    render(<TeamSection detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.team", expect.any(Number))
  })

  it("updates item count when team members change", () => {
    const detail = createMockDetail()

    const { rerender } = render(<TeamSection detail={detail} />)

    // Initial call with 2 members
    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.team", 2)

    // Update to 3 members
    const updatedDetail = createMockDetail({
      teamMembers: [
        ...detail.teamMembers,
        {
          _id: "member3",
          _creationTime: 1234567892,
          orchestrationId: "orch1",
          phaseNumber: "1",
          agentName: "worker3",
          agentType: Option.some("tester"),
          model: Option.some("sonnet"),
          joinedAt: Option.some("2024-01-01T10:10:00Z"),
          recordedAt: "2024-01-01T10:10:00Z",
        },
      ],
    })

    rerender(<TeamSection detail={updatedDetail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.team", 3)
  })
})
