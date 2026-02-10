import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Option } from "effect"
import { TaskListPanel } from "../TaskListPanel"
import type { OrchestrationDetail, TaskEvent } from "@/schemas"

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

describe("TaskListPanel", () => {
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
      selectPhase: vi.fn(),
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
          subject: "Implement feature A",
          description: Option.some("Description for task 1"),
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
          subject: "Write tests for feature A",
          description: Option.some("Description for task 2"),
          status: "in_progress",
          owner: Option.some("worker2"),
          blockedBy: Option.none(),
          metadata: Option.none(),
          recordedAt: "2024-01-01T10:05:00Z",
        },
        {
          _id: "task3",
          _creationTime: 1234567892,
          orchestrationId: "orch1",
          phaseNumber: Option.some("1"),
          taskId: "3",
          subject: "Review implementation",
          description: Option.some("Description for task 3"),
          status: "pending",
          owner: Option.none(),
          blockedBy: Option.some("Task 2 must complete first"),
          metadata: Option.none(),
          recordedAt: "2024-01-01T10:10:00Z",
        },
      ],
      "2": [],
    },
    teamMembers: [],
    ...overrides,
  })

  it("renders empty state when no phase selected", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: null, // No phase selected
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.getByText(/No phase selected/i)).toBeInTheDocument()
  })

  it("renders empty state when selected phase has no tasks", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase2", // Phase 2 has no tasks
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.getByText(/No tasks/i)).toBeInTheDocument()
  })

  it("renders task cards for selected phase's tasks", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase1", // Phase 1 has 3 tasks
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.getByText("Implement feature A")).toBeInTheDocument()
    expect(screen.getByText("Write tests for feature A")).toBeInTheDocument()
    expect(screen.getByText("Review implementation")).toBeInTheDocument()
  })

  it("shows correct task count summary in header", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase1",
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(<TaskListPanel detail={detail} />)

    // Phase 1 has 3 tasks total
    expect(screen.getByText(/3 tasks/i)).toBeInTheDocument()
  })

  it("maps TaskEvent status to TaskCard status (lowercase)", () => {
    const detail = createMockDetail({
      phaseTasks: {
        "1": [
          {
            _id: "task1",
            _creationTime: 1234567890,
            orchestrationId: "orch1",
            phaseNumber: Option.some("1"),
            taskId: "1",
            subject: "Task with completed status",
            description: Option.none(),
            status: "completed",
            owner: Option.none(),
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
            subject: "Task with in_progress status",
            description: Option.none(),
            status: "in_progress",
            owner: Option.none(),
            blockedBy: Option.none(),
            metadata: Option.none(),
            recordedAt: "2024-01-01T10:05:00Z",
          },
        ],
      },
    })

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase1",
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    const { container } = render(<TaskListPanel detail={detail} />)

    // TaskCard should render status badges with lowercase status
    const completedBadge = container.querySelector('[class*="status"]')
    expect(completedBadge).toHaveTextContent("completed")

    const inProgressBadge = container.querySelectorAll('[class*="status"]')[1]
    expect(inProgressBadge).toHaveTextContent("in progress")
  })

  it("maps TaskEvent owner to TaskCard assignee", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase1",
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(<TaskListPanel detail={detail} />)

    // Task 1 has owner "worker1"
    expect(screen.getByText("worker1")).toBeInTheDocument()
    // Task 2 has owner "worker2"
    expect(screen.getByText("worker2")).toBeInTheDocument()
  })

  it("maps TaskEvent blockedBy to TaskCard blockedReason", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase1",
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(<TaskListPanel detail={detail} />)

    // Task 3 has blockedBy reason
    expect(screen.getByText("Task 2 must complete first")).toBeInTheDocument()
  })

  it("registers taskList focus section with correct item count", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase1", // Phase 1 has 3 tasks
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(<TaskListPanel detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 3)
  })

  it("updates item count when phase selection changes", () => {
    const detail = createMockDetail()

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase1", // Phase 1 has 3 tasks
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    const { rerender } = render(<TaskListPanel detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 3)

    // Change to phase 2 which has 0 tasks
    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase2",
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    rerender(<TaskListPanel detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 0)
  })

  it("handles phase with undefined phaseNumber in phaseTasks", () => {
    const detail = createMockDetail({
      phases: [
        {
          _id: "phase1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: "1",
          status: "executing",
          planPath: Option.none(),
          gitRange: Option.none(),
          planningMins: Option.none(),
          executionMins: Option.none(),
          reviewMins: Option.none(),
          startedAt: Option.none(),
          completedAt: Option.none(),
        },
      ],
      phaseTasks: {}, // No tasks for any phase
    })

    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: "phase1",
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })

    render(<TaskListPanel detail={detail} />)

    // Should show empty state, not crash
    expect(screen.getByText(/No tasks/i)).toBeInTheDocument()
  })
})
