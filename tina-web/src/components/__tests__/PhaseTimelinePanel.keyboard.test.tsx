import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import { PhaseTimelinePanel } from "../PhaseTimelinePanel"
import { buildPhaseTimelineDetail } from "@/test/builders/domain"
import {
  createActionRegistrationCapture,
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

const actionCapture = createActionRegistrationCapture()
const mockSelectPhase = vi.fn()
const phaseIds = ["phase1", "phase2", "phase3"] as const

function setSelection(overrides: Partial<SelectionStateMock> = {}) {
  mockUseSelection.mockReturnValue(
    selectionState({
      orchestrationId: "orch1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: mockSelectPhase,
      ...overrides,
    }),
  )
}

function setFocus(isSectionFocused = false, activeIndex = -1) {
  mockUseFocusable.mockReturnValue(focusableState({ isSectionFocused, activeIndex }))
}

function renderTimelineView({
  isSectionFocused = false,
  activeIndex = -1,
  selection,
  detail = buildPhaseTimelineDetail(),
}: {
  isSectionFocused?: boolean
  activeIndex?: number
  selection?: string | null
  detail?: ReturnType<typeof buildPhaseTimelineDetail>
} = {}) {
  setFocus(isSectionFocused, activeIndex)
  setSelection({ phaseId: selection ?? null })
  return { detail, ...render(<PhaseTimelinePanel detail={detail} />) }
}

function getAction(id: string) {
  const action = actionCapture.byId(id)
  expect(action).toBeDefined()
  return action!
}

function phaseById(container: HTMLElement, phaseId: string) {
  const phase = container.querySelector(`[id="phase-${phaseId}"]`)
  expect(phase).toBeTruthy()
  return phase
}

describe("PhaseTimelinePanel - Keyboard Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    actionCapture.reset()
    setFocus()
    setSelection()
    mockUseActionRegistration.mockImplementation(actionCapture.register)
  })

  it("registers Enter action with correct scope", () => {
    renderTimelineView({ isSectionFocused: true, activeIndex: 0 })

    expect(mockUseActionRegistration).toHaveBeenCalledWith({
      id: "phase-timeline-select",
      label: "Select Phase",
      key: "Enter",
      when: "phaseTimeline",
      execute: expect.any(Function),
    })
  })

  it("calls selectPhase with active phase ID when Enter action executes", () => {
    renderTimelineView({ isSectionFocused: true, activeIndex: 1 })
    getAction("phase-timeline-select").execute({})

    expect(mockSelectPhase).toHaveBeenCalledWith("phase2")
  })

  it.each([999, -1])(
    "does not crash when Enter is pressed with invalid activeIndex %s",
    (activeIndex) => {
      renderTimelineView({ isSectionFocused: true, activeIndex })

      expect(() => getAction("phase-timeline-select").execute({})).not.toThrow()
      expect(mockSelectPhase).not.toHaveBeenCalled()
    },
  )

  it("sets tabindex and aria-activedescendant for focused phase", () => {
    const { container } = renderTimelineView({ isSectionFocused: true, activeIndex: 1 })

    expect(phaseById(container, "phase2")).toHaveAttribute("tabIndex", "0")
    expect(phaseById(container, "phase1")).toHaveAttribute("tabIndex", "-1")
    expect(phaseById(container, "phase3")).toHaveAttribute("tabIndex", "-1")
    expect(container.querySelector('[role="listbox"]')).toHaveAttribute(
      "aria-activedescendant",
      "phase-phase2",
    )
  })

  it.each([
    { isSectionFocused: false, activeIndex: 1 },
    { isSectionFocused: true, activeIndex: 999 },
  ])("clears active descendant for invalid focus state (%o)", ({ isSectionFocused, activeIndex }) => {
    const { container } = renderTimelineView({ isSectionFocused, activeIndex })

    for (const phaseId of phaseIds) {
      expect(phaseById(container, phaseId)).toHaveAttribute("tabIndex", "-1")
    }
    expect(container.querySelector('[role="listbox"]')).not.toHaveAttribute("aria-activedescendant")
  })

  it.each([
    { selection: "phase3", expectedCurrent: "phase3" },
    { selection: "phase2", expectedCurrent: "phase2" },
  ])("applies focus and selection styling (selection=$selection)", ({ selection, expectedCurrent }) => {
    const { container } = renderTimelineView({
      isSectionFocused: true,
      activeIndex: 1,
      selection,
    })

    expect(phaseById(container, "phase2")).toHaveAttribute("data-focused", "true")
    expect(phaseById(container, expectedCurrent)).toHaveAttribute("aria-current", "step")
  })

  it("registers phaseTimeline section with correct item count", () => {
    renderTimelineView()
    expect(mockUseFocusable).toHaveBeenCalledWith("phaseTimeline", 3)
  })

  it("updates item count when phases change", () => {
    const detail = buildPhaseTimelineDetail()
    const { rerender } = renderTimelineView({ detail })

    expect(mockUseFocusable).toHaveBeenCalledWith("phaseTimeline", 3)

    rerender(
      <PhaseTimelinePanel
        detail={buildPhaseTimelineDetail({
          phases: detail.phases.slice(0, 2),
          totalPhases: 2,
        })}
      />,
    )

    expect(mockUseFocusable).toHaveBeenCalledWith("phaseTimeline", 2)
  })

  it("sets stable phase item IDs and active descendant format", () => {
    const { container } = renderTimelineView({ isSectionFocused: true, activeIndex: 0 })

    for (const phaseId of phaseIds) {
      expect(phaseById(container, phaseId)).toHaveAttribute("id", `phase-${phaseId}`)
    }

    const activeDescendantId = container
      .querySelector('[role="listbox"]')
      ?.getAttribute("aria-activedescendant")
    expect(activeDescendantId).toBe(phaseById(container, "phase1")?.getAttribute("id"))
  })
})
