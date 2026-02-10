import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { TaskQuicklook } from "../TaskQuicklook"
import type { TaskEvent } from "@/schemas"

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

  it("closes modal when Escape is pressed", async () => {
    const user = userEvent.setup()
    const task = createMockTask()

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    await user.keyboard("{Escape}")

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("closes modal when Space is pressed", async () => {
    const user = userEvent.setup()
    const task = createMockTask()

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    await user.keyboard(" ")

    expect(mockOnClose).toHaveBeenCalledOnce()
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

  it("traps focus inside modal", async () => {
    const user = userEvent.setup()
    const task = createMockTask()

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    // Modal should be focused on mount
    const modal = screen.getByRole("dialog")
    expect(modal).toHaveFocus()

    // Tab through focusable elements - focus should stay within modal
    await user.tab()
    const closeButton = screen.getByRole("button", { name: /close/i })
    expect(closeButton).toHaveFocus()

    // Tab again - should cycle back to modal
    await user.tab()
    expect(modal.contains(document.activeElement)).toBe(true)
  })

  it("receives focus on mount", () => {
    const task = createMockTask()

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    const modal = screen.getByRole("dialog")
    expect(modal).toHaveFocus()
  })

  it("has correct aria attributes", () => {
    const task = createMockTask()

    render(<TaskQuicklook task={task} onClose={mockOnClose} />)

    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAttribute("aria-labelledby")
  })
})
