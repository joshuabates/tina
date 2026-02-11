import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { TaskListPanel } from "../TaskListPanel"
import {
  buildPhase,
  buildTaskEvent,
  buildTaskListDetail,
  buildTeamMember,
  none,
  some,
} from "@/test/builders/domain"
import { setPanelFocus, setPanelSelection } from "@/test/harness/panel-state"

vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection

describe("TaskListPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPanelFocus(mockUseFocusable)
    setPanelSelection(mockUseSelection)
  })

  it("renders empty state when no phase selected", () => {
    setPanelSelection(mockUseSelection, { phaseId: null })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(screen.getByText(/No phase selected/i)).toBeInTheDocument()
  })

  it("renders empty state when selected phase has no tasks", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase2" })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(screen.getByText(/No tasks/i)).toBeInTheDocument()
  })

  it("renders task cards for selected phase's tasks", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(screen.getByText("Implement feature A")).toBeInTheDocument()
    expect(screen.getByText("Write tests for feature A")).toBeInTheDocument()
    expect(screen.getByText("Review implementation")).toBeInTheDocument()
  })

  it("shows correct task count summary in header", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(screen.getByText(/3 tasks/i)).toBeInTheDocument()
  })

  it("shows compact relative update times for tasks", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01T10:15:00Z"))
    try {
      setPanelSelection(mockUseSelection, { phaseId: "phase1" })
      render(<TaskListPanel detail={buildTaskListDetail()} />)

      expect(screen.getByText("updated 15m")).toBeInTheDocument()
      expect(screen.getByText("updated 10m")).toBeInTheDocument()
      expect(screen.getByText("updated 5m")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("maps TaskEvent status to task indicators", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    const detail = buildTaskListDetail({
      phaseTasks: {
        "1": [
          buildTaskEvent({
            _id: "task1",
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "1",
            subject: "Task with completed status",
            description: none<string>(),
            status: "completed",
            owner: none<string>(),
            blockedBy: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:00:00Z",
          }),
          buildTaskEvent({
            _id: "task2",
            _creationTime: 1234567891,
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "2",
            subject: "Task with in_progress status",
            description: none<string>(),
            status: "in_progress",
            owner: none<string>(),
            blockedBy: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:05:00Z",
          }),
        ],
      },
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.getByRole("img", { name: "Task complete" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Task in progress" })).toBeInTheDocument()
  })

  it("renders checkbox or spinner task indicators based on status", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    const detail = buildTaskListDetail({
      phaseTasks: {
        "1": [
          buildTaskEvent({
            _id: "task1",
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "1",
            subject: "Completed task",
            description: none<string>(),
            status: "completed",
            owner: none<string>(),
            blockedBy: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:00:00Z",
          }),
          buildTaskEvent({
            _id: "task2",
            _creationTime: 1234567891,
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "2",
            subject: "Running task",
            description: none<string>(),
            status: "in_progress",
            owner: none<string>(),
            blockedBy: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:05:00Z",
          }),
          buildTaskEvent({
            _id: "task3",
            _creationTime: 1234567892,
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "3",
            subject: "Pending task",
            description: none<string>(),
            status: "pending",
            owner: none<string>(),
            blockedBy: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:10:00Z",
          }),
        ],
      },
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.getByRole("img", { name: "Task complete" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Task in progress" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Task not complete" })).toBeInTheDocument()
  })

  it("maps TaskEvent owner to TaskCard assignee", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(screen.getByText("worker1")).toBeInTheDocument()
    expect(screen.getByText("worker2")).toBeInTheDocument()
  })

  it("keeps Task N prefix when present in subject", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    const detail = buildTaskListDetail({
      phaseTasks: {
        "1": [
          buildTaskEvent({
            _id: "task-prefixed",
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "5",
            subject: "Task 5: Run full test suite and commit",
            description: none<string>(),
            status: "in_progress",
            owner: some("worker-5"),
            blockedBy: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:15:00Z",
          }),
        ],
      },
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.getByText("Task 5: Run full test suite and commit")).toBeInTheDocument()
  })

  it("shows task model from matching team members", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    const detail = buildTaskListDetail({
      teamMembers: [
        buildTeamMember({
          _id: "member1",
          orchestrationId: "orch1",
          phaseNumber: "1",
          agentName: "worker-1",
          model: some("gpt-5.3-codex"),
          recordedAt: "2024-01-01T10:00:00Z",
        }),
        buildTeamMember({
          _id: "member2",
          _creationTime: 1234567891,
          orchestrationId: "orch1",
          phaseNumber: "1",
          agentName: "worker-2",
          model: some("claude-sonnet-4-5"),
          recordedAt: "2024-01-01T10:05:00Z",
        }),
      ],
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.getByText("gpt-5.3-codex")).toBeInTheDocument()
    expect(screen.getByText("claude-sonnet-4-5")).toBeInTheDocument()
  })

  it("does not render blocked-by helper text in the table view", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(screen.queryByText("Task 2 must complete first")).not.toBeInTheDocument()
  })

  it("orders tasks by dependency and moves completed tasks below active work", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    const detail = buildTaskListDetail({
      phaseTasks: {
        "1": [
          buildTaskEvent({
            _id: "task3",
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "3",
            subject: "Review implementation",
            status: "in_progress",
            blockedBy: some("[\"2\"]"),
            description: none<string>(),
            owner: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:10:00Z",
          }),
          buildTaskEvent({
            _id: "task1",
            _creationTime: 1234567891,
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "1",
            subject: "Draft implementation plan",
            status: "completed",
            blockedBy: none<string>(),
            description: none<string>(),
            owner: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:00:00Z",
          }),
          buildTaskEvent({
            _id: "task4",
            _creationTime: 1234567892,
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "4",
            subject: "Parallel prep work",
            status: "pending",
            blockedBy: none<string>(),
            description: none<string>(),
            owner: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:12:00Z",
          }),
          buildTaskEvent({
            _id: "task2",
            _creationTime: 1234567893,
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "2",
            subject: "Implement API endpoints",
            status: "pending",
            blockedBy: some("[\"1\"]"),
            description: none<string>(),
            owner: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:05:00Z",
          }),
        ],
      },
    })

    render(<TaskListPanel detail={detail} />)

    const orderedSubjects = screen
      .getAllByRole("heading", { level: 4 })
      .map((node) => node.textContent)

    expect(orderedSubjects).toEqual([
      "Parallel prep work",
      "Implement API endpoints",
      "Review implementation",
      "Draft implementation plan",
    ])
  })

  it("does not render inline blocker details for unresolved dependencies", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    const detail = buildTaskListDetail({
      phaseTasks: {
        "1": [
          buildTaskEvent({
            _id: "task1",
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "1",
            subject: "Create migration",
            status: "completed",
            blockedBy: none<string>(),
            description: none<string>(),
            owner: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:00:00Z",
          }),
          buildTaskEvent({
            _id: "task2",
            _creationTime: 1234567891,
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "2",
            subject: "Apply migration",
            status: "pending",
            blockedBy: some("[\"1\"]"),
            description: none<string>(),
            owner: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:05:00Z",
          }),
          buildTaskEvent({
            _id: "task3",
            _creationTime: 1234567892,
            orchestrationId: "orch1",
            phaseNumber: some("1"),
            taskId: "3",
            subject: "Backfill data",
            status: "pending",
            blockedBy: some("[\"2\"]"),
            description: none<string>(),
            owner: none<string>(),
            metadata: none<string>(),
            recordedAt: "2024-01-01T10:10:00Z",
          }),
        ],
      },
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.queryByText(/Blocked by Create migration/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Blocked by Apply migration/i)).not.toBeInTheDocument()
  })

  it("registers taskList focus section with correct item count", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 3)
  })

  it("updates item count when phase selection changes", () => {
    const detail = buildTaskListDetail()
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    const { rerender } = render(<TaskListPanel detail={detail} />)
    expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 3)

    setPanelSelection(mockUseSelection, { phaseId: "phase2" })
    rerender(<TaskListPanel detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 0)
  })

  it("handles phase with undefined phaseNumber in phaseTasks", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    const detail = buildTaskListDetail({
      phases: [
        buildPhase({
          _id: "phase1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: "1",
          status: "executing",
        }),
      ],
      phaseTasks: {},
    })

    render(<TaskListPanel detail={detail} />)

    expect(screen.getByText(/No tasks/i)).toBeInTheDocument()
  })
})
