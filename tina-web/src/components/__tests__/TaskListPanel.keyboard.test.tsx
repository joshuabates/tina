import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within, waitFor, act } from "@testing-library/react"
import { TaskListPanel } from "../TaskListPanel"
import { buildTaskListDetail } from "@/test/builders/domain"
import { assertRovingFocus } from "@/test/harness/roving"
import type { ActionContext } from "@/services/action-registry"
import {
  type SelectionStateMock,
} from "@/test/harness/hooks"
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
const mockUseActionRegistration = vi.mocked(
  await import("@/hooks/useActionRegistration"),
).useActionRegistration

const taskIds = ["task2", "task3", "task1"] as const

function setSelection(overrides: Partial<SelectionStateMock> = {}) {
  setPanelSelection(
    mockUseSelection,
    { phaseId: "phase1", ...overrides },
    { phaseId: "phase1" },
  )
}

function setFocus(isSectionFocused = false, activeIndex = -1) {
  setPanelFocus(mockUseFocusable, isSectionFocused, activeIndex)
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
    setPanelSelection(mockUseSelection)
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

      assertRovingFocus({
        container,
        listRole: "list",
        itemIds: taskIds.map((id) => `task-${id}`),
        activeId: "task-task3",
        focusedAttr: "data-focused",
      })
    })

    it.each([
      { isSectionFocused: false, activeIndex: 1 },
      { isSectionFocused: true, activeIndex: 999 },
      { isSectionFocused: true, activeIndex: -1 },
    ])(
      "clears active descendant and focused tab stop for invalid state (%o)",
      ({ isSectionFocused, activeIndex }) => {
        const { container } = renderTaskListView({ isSectionFocused, activeIndex })

        assertRovingFocus({
          container,
          listRole: "list",
          itemIds: taskIds.map((id) => `task-${id}`),
          activeId: null,
          focusedAttr: "data-focused",
          expectActiveDescendant: false,
        })
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
      const task2Id = taskById(container, "task2")?.getAttribute("id")

      expect(activeDescendantId).toBe(task2Id)
      expect(activeDescendantId).toBe("task-task2")
    })
  })

  describe("Focus ring visibility", () => {
    it.each([
      { isSectionFocused: true, expected: "true" },
      { isSectionFocused: false, expected: undefined },
    ])("sets data-focused based on section focus (%o)", ({ isSectionFocused, expected }) => {
      const { container } = renderTaskListView({ isSectionFocused, activeIndex: 1 })
      if (expected) {
        expect(taskById(container, "task3")).toHaveAttribute("data-focused", expected)
      } else {
        expect(taskById(container, "task3")).not.toHaveAttribute("data-focused", "true")
      }
    })

    it("applies visual focus classes for keyboard-selected task", () => {
      const { container } = renderTaskListView({ isSectionFocused: true, activeIndex: 1 })
      const focusedTask = taskById(container, "task3")

      expect(focusedTask).toHaveClass("data-[focused=true]:ring-2")
      expect(focusedTask).toHaveClass("data-[focused=true]:bg-primary/5")
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

  describe("Quicklook sync", () => {
    it("updates modal task when keyboard selection changes while quicklook is open", async () => {
      let openQuicklook: ((ctx: ActionContext) => void) | undefined
      mockUseActionRegistration.mockImplementation((action) => {
        if (action.id === "task-list-quicklook") {
          openQuicklook = action.execute
        }
      })

      const detail = buildTaskListDetail()
      const { rerender } = renderTaskListView({
        isSectionFocused: true,
        activeIndex: 0,
        detail,
      })

      expect(openQuicklook).toBeTypeOf("function")

      act(() => {
        openQuicklook?.({} as ActionContext)
      })

      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(
        within(screen.getByRole("dialog")).getByRole("heading", {
          name: "Write tests for feature A",
        }),
      ).toBeInTheDocument()

      setFocus(true, 1)
      rerender(<TaskListPanel detail={detail} />)

      await waitFor(() => {
        expect(
          within(screen.getByRole("dialog")).getByRole("heading", {
            name: "Review implementation",
          }),
        ).toBeInTheDocument()
      })
    })
  })
})
