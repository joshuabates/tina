import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { TaskListPanel } from "../TaskListPanel"
import {
  buildPhase,
  buildTaskEvent,
  buildTaskListDetail,
  none,
  some,
} from "@/test/builders/domain"
import { setPanelFocus, setPanelSelection } from "@/test/harness/panel-state"
import { expectStatusLabelVisible } from "@/test/harness/status"

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

  it("maps TaskEvent status to TaskCard status (lowercase)", () => {
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

    expectStatusLabelVisible("completed")
    expectStatusLabelVisible("in_progress")
  })

  it("maps TaskEvent owner to TaskCard assignee", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(screen.getByText("worker1")).toBeInTheDocument()
    expect(screen.getByText("worker2")).toBeInTheDocument()
  })

  it("maps TaskEvent blockedBy to TaskCard blockedReason", () => {
    setPanelSelection(mockUseSelection, { phaseId: "phase1" })

    render(<TaskListPanel detail={buildTaskListDetail()} />)

    expect(screen.getByText("Task 2 must complete first")).toBeInTheDocument()
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
