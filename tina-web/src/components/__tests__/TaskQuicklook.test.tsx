import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { TaskQuicklook } from "../TaskQuicklook"
import type { TaskEvent } from "@/schemas"
import { defineQuicklookDialogContract } from "@/test/harness/quicklook-contract"

// Mock useActionRegistration
vi.mock("@/hooks/useActionRegistration")

describe("TaskQuicklook", () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  const createMockTask = (overrides?: Partial<TaskEvent>): TaskEvent => ({
    _id: "task1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: Option.some("1"),
    taskId: "1",
    subject: "Implement feature X",
    description: Option.some("This is a detailed description of the task"),
    status: "in_progress",
    owner: Option.some("worker-1"),
    blockedBy: Option.none(),
    metadata: Option.none(),
    recordedAt: "2024-01-01T10:00:00Z",
    ...overrides,
  })

  it("renders task subject and status badge", () => {
    const task = createMockTask()

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    expect(screen.getByText("Implement feature X")).toBeInTheDocument()
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
  })

  it("renders description when present", () => {
    const task = createMockTask({
      description: Option.some("This is a detailed description of the task"),
    })

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    expect(
      screen.getByText("This is a detailed description of the task")
    ).toBeInTheDocument()
  })

  it('shows "No description" when description is None', () => {
    const task = createMockTask({
      description: Option.none(),
    })

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    expect(screen.getByText(/no description/i)).toBeInTheDocument()
  })

  it("shows owner when present", () => {
    const task = createMockTask({
      owner: Option.some("worker-2"),
    })

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    expect(screen.getByText(/worker-2/)).toBeInTheDocument()
  })

  it("shows blocked reason when present", () => {
    const task = createMockTask({
      blockedBy: Option.some("task-3,task-5"),
    })

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    expect(screen.getByText(/task-3,task-5/)).toBeInTheDocument()
  })

  it("formats JSON blockedBy dependencies for display", () => {
    const task = createMockTask({
      blockedBy: Option.some("[\"task-3\",\"task-5\"]"),
    })

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    expect(screen.getByText(/task-3,task-5/)).toBeInTheDocument()
  })

  it("closes modal on backdrop click", async () => {
    const user = userEvent.setup()
    const task = createMockTask()

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    // Click the backdrop (the overlay element that's not the dialog content)
    const backdrop = screen.getByRole("dialog").parentElement!
    await user.click(backdrop)

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  defineQuicklookDialogContract({
    renderDialog: () => {
      render(<TaskQuicklook task={createMockTask()} onClose={mockOnClose} />)
    },
    onClose: mockOnClose,
  })
})
