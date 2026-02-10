import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import { TaskListPanel } from "../TaskListPanel"
import { buildTaskListDetail } from "@/test/builders/domain"
import {
  focusableState,
  selectionState,
  type SelectionStateMock,
} from "@/test/harness/hooks"

vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection
const mockUseActionRegistration = vi.mocked(
  await import("@/hooks/useActionRegistration"),
).useActionRegistration

const taskIds = ["task1", "task2", "task3"] as const

function setSelection(overrides: Partial<SelectionStateMock> = {}) {
  mockUseSelection.mockReturnValue(
    selectionState({
      orchestrationId: "orch1",
      phaseId: "phase1",
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
      ...overrides,
    }),
  )
}

function setFocus(isSectionFocused = false, activeIndex = -1) {
  mockUseFocusable.mockReturnValue(focusableState({ isSectionFocused, activeIndex }))
}

function renderTaskListView({
  isSectionFocused = false,
  activeIndex = -1,
  selection,
  detail = buildTaskListDetail(),
}: {
  isSectionFocused?: boolean
  activeIndex?: number
  selection?: Partial<SelectionStateMock>
  detail?: ReturnType<typeof buildTaskListDetail>
} = {}) {
  setSelection(selection)
  setFocus(isSectionFocused, activeIndex)
  return { detail, ...render(<TaskListPanel detail={detail} />) }
}

function taskById(container: HTMLElement, id: string) {
  const task = container.querySelector(`[id="task-${id}"]`)
  expect(task).toBeTruthy()
  return task
}

describe("TaskListPanel - Keyboard Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setFocus()
    mockUseSelection.mockReturnValue(selectionState())
    mockUseActionRegistration.mockImplementation(() => {})
  })

  it("registers Space action with taskList scope", () => {
    renderTaskListView({ isSectionFocused: true, activeIndex: 0 })

    expect(mockUseActionRegistration).toHaveBeenCalledWith({
      id: "task-list-quicklook",
      label: "View Task Details",
      key: " ",
      when: "taskList",
      execute: expect.any(Function),
    })
  })

  describe("Roving focus semantics", () => {
    it("sets tabindex and aria-activedescendant for focused task", () => {
      const { container } = renderTaskListView({ isSectionFocused: true, activeIndex: 1 })

      expect(taskById(container, "task2")).toHaveAttribute("tabIndex", "0")
      expect(taskById(container, "task1")).toHaveAttribute("tabIndex", "-1")
      expect(taskById(container, "task3")).toHaveAttribute("tabIndex", "-1")
      expect(container.querySelector('[role="list"]')).toHaveAttribute(
        "aria-activedescendant",
        "task-task2",
      )
    })

    it.each([
      { isSectionFocused: false, activeIndex: 1 },
      { isSectionFocused: true, activeIndex: 999 },
      { isSectionFocused: true, activeIndex: -1 },
    ])(
      "clears active descendant and focused tab stop for invalid state (%o)",
      ({ isSectionFocused, activeIndex }) => {
        const { container } = renderTaskListView({ isSectionFocused, activeIndex })

        for (const taskId of taskIds) {
          expect(taskById(container, taskId)).toHaveAttribute("tabIndex", "-1")
        }
        expect(container.querySelector('[role="list"]')).not.toHaveAttribute("aria-activedescendant")
      },
    )
  })

  describe("Task item IDs", () => {
    it.each(taskIds)("sets unique id on task item %s", (taskId) => {
      const { container } = renderTaskListView()

      expect(taskById(container, taskId)).toHaveAttribute("id", `task-${taskId}`)
    })

    it("id attribute matches aria-activedescendant format", () => {
      const { container } = renderTaskListView({ isSectionFocused: true, activeIndex: 0 })

      const activeDescendantId = container
        .querySelector("[aria-activedescendant]")
        ?.getAttribute("aria-activedescendant")
      const task1Id = taskById(container, "task1")?.getAttribute("id")

      expect(activeDescendantId).toBe(task1Id)
      expect(activeDescendantId).toBe("task-task1")
    })
  })

  describe("Focus ring visibility", () => {
    it.each([
      { isSectionFocused: true, expected: "true" },
      { isSectionFocused: false, expected: undefined },
    ])("sets data-focused based on section focus (%o)", ({ isSectionFocused, expected }) => {
      const { container } = renderTaskListView({ isSectionFocused, activeIndex: 1 })
      if (expected) {
        expect(taskById(container, "task2")).toHaveAttribute("data-focused", expected)
      } else {
        expect(taskById(container, "task2")).not.toHaveAttribute("data-focused", "true")
      }
    })
  })

  describe("Focus section registration", () => {
    it("registers taskList section with correct item count", () => {
      renderTaskListView()
      expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 3)
    })

    it("updates item count when tasks change", () => {
      const detail = buildTaskListDetail()
      const { rerender } = renderTaskListView({ detail })

      expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 3)

      rerender(
        <TaskListPanel
          detail={buildTaskListDetail({
            phaseTasks: {
              "1": detail.phaseTasks["1"].slice(0, 1),
            },
          })}
        />,
      )

      expect(mockUseFocusable).toHaveBeenCalledWith("taskList", 1)
    })
  })
})
