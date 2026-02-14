import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { TaskQuicklook } from "../TaskQuicklook"
import type { TaskEvent } from "@/schemas"
import { defineQuicklookDialogContract } from "@/test/harness/quicklook-contract"

// Mock useActionRegistration
vi.mock("@/hooks/useActionRegistration")

// Mock useCreateSession
vi.mock("@/hooks/useCreateSession")

const mockUseCreateSession = vi.mocked(
  await import("@/hooks/useCreateSession"),
).useCreateSession

// Mock useTypedQuery to avoid Convex client requirement
vi.mock("@/hooks/useTypedQuery", () => ({
  useTypedQuery: vi.fn(() => ({ status: "success", data: [] })),
}))

// Mock useMutation to avoid Convex client requirement
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

describe("TaskQuicklook", () => {
  const mockOnClose = vi.fn()
  const mockCreateAndConnect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCreateSession.mockReturnValue({
      createAndConnect: mockCreateAndConnect,
      connectToPane: vi.fn(),
    })
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

  describe("markdown rendering", () => {
    it("renders task description as markdown with headings", () => {
      const task = createMockTask({
        description: Option.some("## Task Details\n\nImplement **feature X** with *proper* formatting."),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      // Verify h2 heading rendered
      expect(screen.getByRole("heading", { level: 2, name: "Task Details" })).toBeInTheDocument()

      // Verify bold text
      const bold = screen.getByText("feature X")
      expect(bold.tagName.toLowerCase()).toBe("strong")

      // Verify italic text
      const italic = screen.getByText("proper")
      expect(italic.tagName.toLowerCase()).toBe("em")
    })

    it("renders code blocks with syntax highlighting", () => {
      const task = createMockTask({
        description: Option.some("```rust\nfn main() {\n    println!(\"Hello\");\n}\n```"),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      // Verify code content rendered
      expect(screen.getByText(/fn main\(\)/)).toBeInTheDocument()
      expect(screen.getByText(/println!/)).toBeInTheDocument()
    })

    it("renders inline code with background", () => {
      const task = createMockTask({
        description: Option.some("Use `const` and `let` for variables."),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      // Verify inline code elements rendered
      expect(screen.getByText("const")).toBeInTheDocument()
      expect(screen.getByText("let")).toBeInTheDocument()
    })

    it("renders GFM features (tables, task lists, strikethrough)", () => {
      const task = createMockTask({
        description: Option.some(
          "- [x] Done\n- [ ] Todo\n\n~~strikethrough~~\n\n| Col A | Col B |\n|-------|-------|\n| 1     | 2     |"
        ),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      // Verify checkboxes rendered
      const checkboxes = screen.getAllByRole("checkbox")
      expect(checkboxes.length).toBe(2)
      expect(checkboxes[0]).toBeChecked()
      expect(checkboxes[1]).not.toBeChecked()

      // Verify strikethrough
      const strikethrough = screen.getByText("strikethrough")
      expect(strikethrough.tagName.toLowerCase()).toBe("del")

      // Verify table rendered
      const table = screen.getByRole("table")
      expect(table).toBeInTheDocument()
    })

    it("renders lists (ordered and unordered)", () => {
      const task = createMockTask({
        description: Option.some("## Steps\n\n1. First step\n2. Second step\n\n- Bullet one\n- Bullet two"),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      // Verify list items rendered
      expect(screen.getByText("First step")).toBeInTheDocument()
      expect(screen.getByText("Second step")).toBeInTheDocument()
      expect(screen.getByText("Bullet one")).toBeInTheDocument()
      expect(screen.getByText("Bullet two")).toBeInTheDocument()
    })

    it("renders blockquotes", () => {
      const task = createMockTask({
        description: Option.some("> This is a quote\n> Multi-line quote"),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      // Verify blockquote content rendered
      expect(screen.getByText(/This is a quote/)).toBeInTheDocument()
      expect(screen.getByText(/Multi-line quote/)).toBeInTheDocument()
    })

    it("handles plain text descriptions gracefully", () => {
      const task = createMockTask({
        description: Option.some("Plain text task description with no formatting"),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      // Verify text rendered correctly without markdown formatting
      expect(screen.getByText("Plain text task description with no formatting")).toBeInTheDocument()
    })

    it("renders links as clickable", () => {
      const task = createMockTask({
        description: Option.some("See [documentation](https://example.com) for details."),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      // Verify link rendered
      const link = screen.getByRole("link", { name: "documentation" })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute("href", "https://example.com")
    })
  })

  describe("discuss button", () => {
    it("renders a discuss button", () => {
      const task = createMockTask()

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      expect(screen.getByRole("button", { name: /discuss this task/i })).toBeInTheDocument()
    })

    it("calls createAndConnect with task context on click", async () => {
      const user = userEvent.setup()
      const task = createMockTask({
        _id: "task42",
        subject: "Fix the login bug",
        status: "in_progress",
        description: Option.some("Detailed steps here"),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      await user.click(screen.getByRole("button", { name: /discuss this task/i }))

      expect(mockCreateAndConnect).toHaveBeenCalledOnce()
      expect(mockCreateAndConnect).toHaveBeenCalledWith({
        label: "Discuss: Fix the login bug",
        contextType: "task",
        contextId: "task42",
        contextSummary: "Fix the login bug\n\nStatus: in_progress\n\nDetailed steps here",
      })
    })

    it("handles task with no description", async () => {
      const user = userEvent.setup()
      const task = createMockTask({
        _id: "task99",
        subject: "Simple task",
        status: "pending",
        description: Option.none(),
      })

      render(<TaskQuicklook task={task} onClose={mockOnClose} />)

      await user.click(screen.getByRole("button", { name: /discuss this task/i }))

      expect(mockCreateAndConnect).toHaveBeenCalledWith({
        label: "Discuss: Simple task",
        contextType: "task",
        contextId: "task99",
        contextSummary: "Simple task\n\nStatus: pending",
      })
    })
  })

  defineQuicklookDialogContract({
    renderDialog: () => {
      render(<TaskQuicklook task={createMockTask()} onClose={mockOnClose} />)
    },
    onClose: mockOnClose,
  })
})
