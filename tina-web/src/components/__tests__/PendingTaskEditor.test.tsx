import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PendingTaskEditor } from "../PendingTaskEditor"

const mockEnqueue = vi.fn()
const mockUseQuery = vi.fn()

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: vi.fn(() => mockEnqueue),
  }
})

const defaultProps = {
  orchestrationId: "orch1",
  nodeId: "node1",
  featureName: "test-feature",
  phaseNumber: "2",
}

function renderEditor(props: Partial<typeof defaultProps> = {}) {
  return render(<PendingTaskEditor {...defaultProps} {...props} />)
}

function renderEditorWithUser(props: Partial<typeof defaultProps> = {}) {
  const user = userEvent.setup()
  const result = render(<PendingTaskEditor {...defaultProps} {...props} />)
  return { ...result, user }
}

const pendingTask = {
  _id: "task1",
  _creationTime: 1000,
  orchestrationId: "orch1",
  phaseNumber: "2",
  taskNumber: 1,
  subject: "Implement auth module",
  status: "pending",
  model: "opus",
  revision: 1,
  createdAt: 1000,
  updatedAt: 1000,
}

const completedTask = {
  _id: "task2",
  _creationTime: 1001,
  orchestrationId: "orch1",
  phaseNumber: "2",
  taskNumber: 2,
  subject: "Write unit tests",
  status: "completed",
  model: "sonnet",
  revision: 2,
  createdAt: 1000,
  updatedAt: 2000,
}

const insertedTask = {
  _id: "task3",
  _creationTime: 1002,
  orchestrationId: "orch1",
  phaseNumber: "2",
  taskNumber: 3,
  subject: "Add logging",
  status: "pending",
  model: "haiku",
  revision: 1,
  insertedBy: "web-ui",
  createdAt: 1002,
  updatedAt: 1002,
}

describe("PendingTaskEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loading state", () => {
    it("shows loading text when tasks query returns null", () => {
      mockUseQuery.mockReturnValue(null)

      renderEditor()

      expect(screen.getByText("Loading...")).toBeInTheDocument()
      expect(screen.getByText("Tasks")).toBeInTheDocument()
    })
  })

  describe("empty state", () => {
    it("shows empty message when no tasks exist", () => {
      mockUseQuery.mockReturnValue([])

      renderEditor()

      expect(screen.getByText("No tasks for this phase")).toBeInTheDocument()
    })
  })

  describe("task list", () => {
    it("shows header with task count and editable count", () => {
      mockUseQuery.mockReturnValue([pendingTask, completedTask])

      renderEditor()

      expect(screen.getByText(/Phase 2/)).toBeInTheDocument()
      expect(screen.getByText(/2 tasks/)).toBeInTheDocument()
      expect(screen.getByText(/1 editable/)).toBeInTheDocument()
    })

    it("shows task number and subject for each task", () => {
      mockUseQuery.mockReturnValue([pendingTask, completedTask])

      renderEditor()

      expect(screen.getByText("#1")).toBeInTheDocument()
      expect(screen.getByText("Implement auth module")).toBeInTheDocument()
      expect(screen.getByText("#2")).toBeInTheDocument()
      expect(screen.getByText("Write unit tests")).toBeInTheDocument()
    })

    it("shows model select for pending tasks", () => {
      mockUseQuery.mockReturnValue([pendingTask])

      renderEditor()

      const select = screen.getByTestId("task-model-1")
      expect(select).toBeInTheDocument()
      expect(select).toHaveValue("opus")
    })

    it("shows status text instead of select for non-pending tasks", () => {
      mockUseQuery.mockReturnValue([completedTask])

      renderEditor()

      expect(screen.queryByTestId("task-model-2")).not.toBeInTheDocument()
      expect(screen.getByText("completed")).toBeInTheDocument()
    })

    it("shows + indicator for inserted tasks", () => {
      mockUseQuery.mockReturnValue([insertedTask])

      renderEditor()

      expect(screen.getByTestId("inserted-indicator-3")).toBeInTheDocument()
    })

    it("does not show + indicator for non-inserted tasks", () => {
      mockUseQuery.mockReturnValue([pendingTask])

      renderEditor()

      expect(screen.queryByTestId("inserted-indicator-1")).not.toBeInTheDocument()
    })
  })

  describe("model change", () => {
    it("calls enqueueControlAction with task_set_model on model change", async () => {
      mockUseQuery.mockReturnValue([pendingTask])
      mockEnqueue.mockResolvedValue("action-id")
      const { user } = renderEditorWithUser()

      await user.selectOptions(screen.getByTestId("task-model-1"), "sonnet")

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrationId: "orch1",
          nodeId: "node1",
          actionType: "task_set_model",
          requestedBy: "web-ui",
        }),
      )

      const call = mockEnqueue.mock.calls[0][0]
      const payload = JSON.parse(call.payload)
      expect(payload.feature).toBe("test-feature")
      expect(payload.phaseNumber).toBe("2")
      expect(payload.taskNumber).toBe(1)
      expect(payload.revision).toBe(1)
      expect(payload.model).toBe("sonnet")
    })

    it("shows success feedback after model change", async () => {
      mockUseQuery.mockReturnValue([pendingTask])
      mockEnqueue.mockResolvedValue("action-id")
      const { user } = renderEditorWithUser()

      await user.selectOptions(screen.getByTestId("task-model-1"), "haiku")

      expect(screen.getByRole("status")).toHaveTextContent("Task #1 → haiku")
    })

    it("shows error feedback when model change fails", async () => {
      mockUseQuery.mockReturnValue([pendingTask])
      mockEnqueue.mockRejectedValue(new Error("Revision conflict"))
      const { user } = renderEditorWithUser()

      await user.selectOptions(screen.getByTestId("task-model-1"), "haiku")

      expect(screen.getByRole("alert")).toHaveTextContent("Revision conflict")
    })

    it("shows generic error for non-Error rejections", async () => {
      mockUseQuery.mockReturnValue([pendingTask])
      mockEnqueue.mockRejectedValue("unknown")
      const { user } = renderEditorWithUser()

      await user.selectOptions(screen.getByTestId("task-model-1"), "haiku")

      expect(screen.getByRole("alert")).toHaveTextContent("Update failed")
    })
  })

  describe("insert task form", () => {
    it("shows insert task form", () => {
      mockUseQuery.mockReturnValue([pendingTask])

      renderEditor()

      expect(screen.getByTestId("insert-task-subject")).toBeInTheDocument()
      expect(screen.getByTestId("insert-task-model")).toBeInTheDocument()
      expect(screen.getByTestId("insert-task-after")).toBeInTheDocument()
      expect(screen.getByTestId("insert-task-submit")).toBeInTheDocument()
    })

    it("calls enqueueControlAction with task_insert on form submit", async () => {
      mockUseQuery.mockReturnValue([pendingTask])
      mockEnqueue.mockResolvedValue("action-id")
      const { user } = renderEditorWithUser()

      await user.type(screen.getByTestId("insert-task-subject"), "New task")
      await user.selectOptions(screen.getByTestId("insert-task-model"), "sonnet")
      await user.selectOptions(screen.getByTestId("insert-task-after"), "1")
      await user.click(screen.getByTestId("insert-task-submit"))

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrationId: "orch1",
          nodeId: "node1",
          actionType: "task_insert",
          requestedBy: "web-ui",
        }),
      )

      const call = mockEnqueue.mock.calls[0][0]
      const payload = JSON.parse(call.payload)
      expect(payload.feature).toBe("test-feature")
      expect(payload.phaseNumber).toBe("2")
      expect(payload.afterTask).toBe(1)
      expect(payload.subject).toBe("New task")
      expect(payload.model).toBe("sonnet")
    })

    it("clears form and shows success after insert", async () => {
      mockUseQuery.mockReturnValue([pendingTask])
      mockEnqueue.mockResolvedValue("action-id")
      const { user } = renderEditorWithUser()

      await user.type(screen.getByTestId("insert-task-subject"), "New task")
      await user.click(screen.getByTestId("insert-task-submit"))

      expect(screen.getByTestId("insert-task-subject")).toHaveValue("")
      expect(screen.getByRole("status")).toHaveTextContent(/inserted/i)
    })

    it("shows error when insert fails", async () => {
      mockUseQuery.mockReturnValue([pendingTask])
      mockEnqueue.mockRejectedValue(new Error("Insert failed"))
      const { user } = renderEditorWithUser()

      await user.type(screen.getByTestId("insert-task-subject"), "New task")
      await user.click(screen.getByTestId("insert-task-submit"))

      expect(screen.getByRole("alert")).toHaveTextContent("Insert failed")
    })

    it("does not submit when subject is empty", async () => {
      mockUseQuery.mockReturnValue([pendingTask])
      const { user } = renderEditorWithUser()

      await user.click(screen.getByTestId("insert-task-submit"))

      expect(mockEnqueue).not.toHaveBeenCalled()
    })

    it("defaults afterTask to 0 (insert at beginning)", () => {
      mockUseQuery.mockReturnValue([pendingTask])

      renderEditor()

      expect(screen.getByTestId("insert-task-after")).toHaveValue("0")
    })

    it("shows task numbers as afterTask options", () => {
      mockUseQuery.mockReturnValue([pendingTask, completedTask])

      renderEditor()

      const select = screen.getByTestId("insert-task-after")
      const options = within(select).getAllByRole("option")
      expect(options).toHaveLength(3) // "Beginning" + task 1 + task 2
      expect(options[0]).toHaveValue("0")
      expect(options[1]).toHaveValue("1")
      expect(options[2]).toHaveValue("2")
    })
  })

  describe("renders within StatPanel", () => {
    it("renders within a StatPanel titled Tasks", () => {
      mockUseQuery.mockReturnValue([])

      renderEditor()

      expect(screen.getByText("Tasks")).toBeInTheDocument()
    })
  })
})
