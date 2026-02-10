import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { PhaseTimelinePanel } from "../PhaseTimelinePanel"
import type { OrchestrationDetail } from "@/schemas"

// Mock hooks
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection")
).useSelection

describe("PhaseTimelinePanel", () => {
  const mockSelectPhase = vi.fn()

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
      selectOrchestration: vi.fn(),
      selectPhase: mockSelectPhase,
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
      {
        _id: "phase2",
        _creationTime: 1234567891,
        orchestrationId: "orch1",
        phaseNumber: "2",
        status: "planning",
        planPath: Option.none(),
        gitRange: Option.none(),
        planningMins: Option.none(),
        executionMins: Option.none(),
        reviewMins: Option.none(),
        startedAt: Option.none(),
        completedAt: Option.none(),
      },
      {
        _id: "phase3",
        _creationTime: 1234567892,
        orchestrationId: "orch1",
        phaseNumber: "3",
        status: "pending",
        planPath: Option.none(),
        gitRange: Option.none(),
        planningMins: Option.none(),
        executionMins: Option.none(),
        reviewMins: Option.none(),
        startedAt: Option.none(),
        completedAt: Option.none(),
      },
    ],
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {
      "1": [
        {
          _id: "task1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: Option.some("1"),
          taskId: "1",
          subject: "Task 1",
          description: Option.some("Description 1"),
          status: "completed",
          owner: Option.some("worker1"),
          blockedBy: Option.none(),
          metadata: Option.none(),
          recordedAt: "2024-01-01T10:00:00Z",
        },
        {
          _id: "task2",
          _creationTime: 1234567891,
          orchestrationId: "orch1",
          phaseNumber: Option.some("1"),
          taskId: "2",
          subject: "Task 2",
          description: Option.some("Description 2"),
          status: "in_progress",
          owner: Option.some("worker2"),
          blockedBy: Option.none(),
          metadata: Option.none(),
          recordedAt: "2024-01-01T10:05:00Z",
        },
      ],
      "2": [],
    },
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

  it("renders all phases from detail data", () => {
    const detail = createMockDetail()

    render(<PhaseTimelinePanel detail={detail} />)

    expect(screen.getByText(/Phase 1/)).toBeInTheDocument()
    expect(screen.getByText(/Phase 2/)).toBeInTheDocument()
    expect(screen.getByText(/Phase 3/)).toBeInTheDocument()
  })

  it("shows correct task counts per phase", () => {
    const detail = createMockDetail()

    const { container } = render(<PhaseTimelinePanel detail={detail} />)

    // Phase 1 has 2 tasks
    const phase1Element = container.querySelector('[_id="phase1"]')
    expect(phase1Element).toHaveTextContent("2 tasks")

    // Phase 2 has 0 tasks
    const phase2Element = container.querySelector('[_id="phase2"]')
    expect(phase2Element).toHaveTextContent("0 tasks")

    // Phase 3 has 0 tasks
    const phase3Element = container.querySelector('[_id="phase3"]')
    expect(phase3Element).toHaveTextContent("0 tasks")
  })

  it("shows correct completed counts per phase", () => {
    const detail = createMockDetail()

    const { container } = render(<PhaseTimelinePanel detail={detail} />)

    // Phase 1 has 1 completed task out of 2
    const phase1Element = container.querySelector('[_id="phase1"]')
    expect(phase1Element).toHaveTextContent("1 done")

    // Phase 2 has 0 completed
    const phase2Element = container.querySelector('[_id="phase2"]')
    expect(phase2Element).toHaveTextContent("0 done")

    // Phase 3 has 0 completed
    const phase3Element = container.querySelector('[_id="phase3"]')
    expect(phase3Element).toHaveTextContent("0 done")
  })

  it("shows correct team counts per phase", () => {
    const detail = createMockDetail()

    const { container } = render(<PhaseTimelinePanel detail={detail} />)

    // Phase 1 has 2 team members
    const phase1Element = container.querySelector('[_id="phase1"]')
    expect(phase1Element).toHaveTextContent("2 team")

    // Phase 2 has 0 team members
    const phase2Element = container.querySelector('[_id="phase2"]')
    expect(phase2Element).toHaveTextContent("0 team")

    // Phase 3 has 0 team members
    const phase3Element = container.querySelector('[_id="phase3"]')
    expect(phase3Element).toHaveTextContent("0 team")
  })

  it("highlights selected phase", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase2",
      selectOrchestration: vi.fn(),
      selectPhase: mockSelectPhase,
    })

    const { container } = render(<PhaseTimelinePanel detail={detail} />)

    // Phase 2 should be highlighted with ring-2
    const phase2Element = container.querySelector('[_id="phase2"]')
    expect(phase2Element).toHaveClass("ring-2")
  })

  it("calls selectPhase on click", async () => {
    const user = userEvent.setup()
    const detail = createMockDetail()

    const { container } = render(<PhaseTimelinePanel detail={detail} />)

    const phase2Element = container.querySelector('[_id="phase2"]')
    await user.click(phase2Element!)

    expect(mockSelectPhase).toHaveBeenCalledWith("phase2")
  })

  it("registers phaseTimeline focus section with correct item count", () => {
    const detail = createMockDetail()

    render(<PhaseTimelinePanel detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("phaseTimeline", 3)
  })

  it("maps phase status strings to StatusBadge status values", () => {
    const detail = createMockDetail({
      phases: [
        {
          _id: "phase1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: "1",
          status: "COMPLETE",
          planPath: Option.none(),
          gitRange: Option.none(),
          planningMins: Option.none(),
          executionMins: Option.none(),
          reviewMins: Option.none(),
          startedAt: Option.none(),
          completedAt: Option.none(),
        },
        {
          _id: "phase2",
          _creationTime: 1234567891,
          orchestrationId: "orch1",
          phaseNumber: "2",
          status: "EXECUTING",
          planPath: Option.none(),
          gitRange: Option.none(),
          planningMins: Option.none(),
          executionMins: Option.none(),
          reviewMins: Option.none(),
          startedAt: Option.none(),
          completedAt: Option.none(),
        },
      ],
      phaseTasks: {},
    })

    render(<PhaseTimelinePanel detail={detail} />)

    // StatusBadge displays uppercase but the component lowercases the status string before passing
    // Check that the badge is rendered with correct styling (which validates the mapping)
    expect(screen.getByText("complete")).toBeInTheDocument()
    expect(screen.getByText("executing")).toBeInTheDocument()
  })

  it("handles empty phases array", () => {
    const detail = createMockDetail({
      phases: [],
      phaseTasks: {},
      teamMembers: [],
      totalPhases: 0,
    })

    const { container } = render(<PhaseTimelinePanel detail={detail} />)

    // Should not crash and timeline should be empty
    const phaseElements = container.querySelectorAll('[_id^="phase"]')
    expect(phaseElements).toHaveLength(0)
  })

  it("handles invalid phaseNumber parsing by defaulting to 0", () => {
    const detail = createMockDetail({
      phases: [
        {
          _id: "phase1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: "invalid",
          status: "planning",
          planPath: Option.none(),
          gitRange: Option.none(),
          planningMins: Option.none(),
          executionMins: Option.none(),
          reviewMins: Option.none(),
          startedAt: Option.none(),
          completedAt: Option.none(),
        },
      ],
      phaseTasks: {},
    })

    render(<PhaseTimelinePanel detail={detail} />)

    // Should render with phase number 0 and not crash
    expect(screen.getByText(/Phase 0/)).toBeInTheDocument()
  })

  it("highlights focused phase when section is focused", () => {
    const detail = createMockDetail()

    mockUseFocusable.mockReturnValue({
      isSectionFocused: true,
      activeIndex: 1, // Phase 2 (0-indexed)
    })

    const { container } = render(<PhaseTimelinePanel detail={detail} />)

    // Phase 2 should be highlighted - find the PhaseCard element with _id
    const phase2Element = container.querySelector('[_id="phase2"]')
    expect(phase2Element).toHaveAttribute("data-focused", "true")
  })
})
