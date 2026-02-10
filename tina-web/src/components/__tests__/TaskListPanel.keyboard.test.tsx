import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import { Option } from "effect"
import { TaskListPanel } from "../TaskListPanel"
import type { OrchestrationDetail } from "@/schemas"
import type { ActionContext } from "@/services/action-registry"

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
const mockUseActionRegistration = vi.mocked(
  await import("@/hooks/useActionRegistration")
).useActionRegistration

describe("TaskListPanel - Keyboard Navigation", () => {
  let mockExecute: ((ctx: ActionContext) => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute = undefined

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
    })

    // Default mock for useSelection
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: vi.fn() as any,
      selectPhase: vi.fn() as any,
    })

    // Capture execute function from useActionRegistration
    mockUseActionRegistration.mockImplementation((config) => {
      if (config.key === " " || config.key === "Space") {
        mockExecute = config.execute
      }
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
        {
          _id: "task3",
          _creationTime: 1234567892,
          orchestrationId: "orch1",
          phaseNumber: Option.some("1"),
          taskId: "3",
          subject: "Task 3",
          description: Option.some("Description 3"),
          status: "pending",
          owner: Option.none(),
          blockedBy: Option.none(),
          metadata: Option.none(),
          recordedAt: "2024-01-01T10:10:00Z",
        },
      ],
    },
    teamMembers: [],
    ...overrides,
  })

  describe("Space key action", () => {
    it("registers Space action with taskList scope", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 0,
      })

      render(<TaskListPanel detail={detail} />)

      expect(mockUseActionRegistration).toHaveBeenCalledWith({
        id: "task-list-quicklook",
        label: "View Task Details",
        key: " ",
        when: "taskList",
        execute: expect.any(Function),
      })
    })
  })

  describe("Roving tabindex", () => {
    it("sets tabindex=0 on focused task item", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Task 2
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const task2Element = container.querySelector('[id="task-task2"]')
      expect(task2Element).toHaveAttribute("tabIndex", "0")
    })

    it("sets tabindex=-1 on non-focused task items", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Task 2
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const task1Element = container.querySelector('[id="task-task1"]')
      expect(task1Element).toHaveAttribute("tabIndex", "-1")

      const task3Element = container.querySelector('[id="task-task3"]')
      expect(task3Element).toHaveAttribute("tabIndex", "-1")
    })

    it("sets tabindex=-1 on all items when section is not focused", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: false,
        activeIndex: 1,
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const task1Element = container.querySelector('[id="task-task1"]')
      expect(task1Element).toHaveAttribute("tabIndex", "-1")

      const task2Element = container.querySelector('[id="task-task2"]')
      expect(task2Element).toHaveAttribute("tabIndex", "-1")

      const task3Element = container.querySelector('[id="task-task3"]')
      expect(task3Element).toHaveAttribute("tabIndex", "-1")
    })
  })

  describe("aria-activedescendant", () => {
    it("sets aria-activedescendant to focused task ID", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Task 2
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const taskListContainer = container.querySelector('[aria-activedescendant]')
      expect(taskListContainer).toHaveAttribute("aria-activedescendant", "task-task2")
    })

    it("does not set aria-activedescendant when section not focused", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: false,
        activeIndex: 1,
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      // Find the task list container by looking for an element with task items
      const taskListContainer = container.querySelector('[role="list"]')
      expect(taskListContainer).not.toHaveAttribute("aria-activedescendant")
    })

    it("does not set aria-activedescendant when activeIndex is out of bounds", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 999, // Out of bounds
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const taskListContainer = container.querySelector('[role="list"]')
      expect(taskListContainer).not.toHaveAttribute("aria-activedescendant")
    })

    it("does not set aria-activedescendant when activeIndex is negative", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: -1,
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const taskListContainer = container.querySelector('[role="list"]')
      expect(taskListContainer).not.toHaveAttribute("aria-activedescendant")
    })
  })

  describe("Task item IDs", () => {
    it("sets unique id on each task item", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const task1Element = container.querySelector('[id="task-task1"]')
      expect(task1Element).toHaveAttribute("id", "task-task1")

      const task2Element = container.querySelector('[id="task-task2"]')
      expect(task2Element).toHaveAttribute("id", "task-task2")

      const task3Element = container.querySelector('[id="task-task3"]')
      expect(task3Element).toHaveAttribute("id", "task-task3")
    })

    it("id attribute matches aria-activedescendant format", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 0,
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const taskListContainer = container.querySelector('[aria-activedescendant]')
      const activeDescendantId = taskListContainer?.getAttribute("aria-activedescendant")

      const task1Element = container.querySelector('[id="task-task1"]')
      const task1Id = task1Element?.getAttribute("id")

      expect(activeDescendantId).toBe(task1Id)
      expect(activeDescendantId).toBe("task-task1")
    })
  })

  describe("Focus ring visibility", () => {
    it("shows focus ring on focused task item", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Task 2
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const task2Element = container.querySelector('[id="task-task2"]')
      expect(task2Element).toHaveAttribute("data-focused", "true")
    })

    it("does not show focus ring when section is not focused", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      mockUseFocusable.mockReturnValue({
        isSectionFocused: false,
        activeIndex: 1,
      })

      const { container } = render(<TaskListPanel detail={detail} />)

      const task2Element = container.querySelector('[id="task-task2"]')
      expect(task2Element).not.toHaveAttribute("data-focused", "true")
    })
  })

  describe("Focus section registration", () => {
    it("registers taskList section with correct item count", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      render(<TaskListPanel detail={detail} />)

      expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 3)
    })

    it("updates item count when tasks change", () => {
      const detail = createMockDetail()

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase1",
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      const { rerender } = render(<TaskListPanel detail={detail} />)

      expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 3)

      // Update with fewer tasks
      const updatedDetail = createMockDetail({
        phaseTasks: {
          "1": detail.phaseTasks["1"].slice(0, 1),
        },
      })

      rerender(<TaskListPanel detail={updatedDetail} />)

      expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 1)
    })
  })
})
