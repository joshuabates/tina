import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { PhaseTimelinePanel } from "../PhaseTimelinePanel"
import { buildPhase, buildPhaseTimelineDetail } from "@/test/builders/domain"
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

const mockSelectPhase = vi.fn()

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
  detail = buildPhaseTimelineDetail(),
  isSectionFocused = false,
  activeIndex = -1,
  selection,
}: {
  detail?: ReturnType<typeof buildPhaseTimelineDetail>
  isSectionFocused?: boolean
  activeIndex?: number
  selection?: Partial<SelectionStateMock>
} = {}) {
  setSelection(selection)
  setFocus(isSectionFocused, activeIndex)
  return { detail, ...render(<PhaseTimelinePanel detail={detail} />) }
}

function phaseById(container: HTMLElement, phaseId: string) {
  const phase = container.querySelector(`[_id="${phaseId}"]`)
  expect(phase).toBeTruthy()
  return phase
}

describe("PhaseTimelinePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setFocus()
    setSelection()
  })

  it("renders all phases from detail data", () => {
    renderTimelineView()

    expect(screen.getByText(/Phase 1/)).toBeInTheDocument()
    expect(screen.getByText(/Phase 2/)).toBeInTheDocument()
    expect(screen.getByText(/Phase 3/)).toBeInTheDocument()
  })

  it.each([
    {
      label: "task counts",
      expectations: [
        ["phase1", "2 tasks"],
        ["phase2", "0 tasks"],
        ["phase3", "0 tasks"],
      ],
    },
    {
      label: "completed counts",
      expectations: [
        ["phase1", "1 done"],
        ["phase2", "0 done"],
        ["phase3", "0 done"],
      ],
    },
    {
      label: "team counts",
      expectations: [
        ["phase1", "2 team"],
        ["phase2", "0 team"],
        ["phase3", "0 team"],
      ],
    },
  ])("shows correct $label", ({ expectations }) => {
    const { container } = renderTimelineView()
    for (const [phaseId, text] of expectations) {
      expect(phaseById(container, phaseId)).toHaveTextContent(text)
    }
  })

  it("highlights selected phase", () => {
    const { container } = renderTimelineView({ selection: { phaseId: "phase2" } })
    expect(phaseById(container, "phase2")).toHaveAttribute("aria-current", "step")
  })

  it("calls selectPhase on click", async () => {
    const user = userEvent.setup()
    const { container } = renderTimelineView()

    await user.click(phaseById(container, "phase2") as Element)

    expect(mockSelectPhase).toHaveBeenCalledWith("phase2")
  })

  it("registers phaseTimeline focus section with correct item count", () => {
    renderTimelineView()
    expect(mockUseFocusable).toHaveBeenCalledWith("phaseTimeline", 3)
  })

  it("maps phase status strings to StatusBadge status values", () => {
    const detail = buildPhaseTimelineDetail({
      phases: [
        buildPhase({ _id: "phase1", orchestrationId: "orch1", phaseNumber: "1", status: "COMPLETE" }),
        buildPhase({ _id: "phase2", _creationTime: 1234567891, orchestrationId: "orch1", phaseNumber: "2", status: "EXECUTING" }),
      ],
      phaseTasks: {},
    })

    const { container } = renderTimelineView({ detail })

    expect(phaseById(container, "phase1")).toHaveTextContent("complete")
    expect(phaseById(container, "phase2")).toHaveTextContent("executing")
  })

  it("handles empty phases array", () => {
    const { container } = renderTimelineView({
      detail: buildPhaseTimelineDetail({
        phases: [],
        phaseTasks: {},
        teamMembers: [],
        totalPhases: 0,
      }),
    })

    expect(container.querySelectorAll('[_id^="phase"]')).toHaveLength(0)
  })

  it("handles invalid phaseNumber parsing by defaulting to 0", () => {
    renderTimelineView({
      detail: buildPhaseTimelineDetail({
        phases: [
          buildPhase({
            _id: "phase1",
            orchestrationId: "orch1",
            phaseNumber: "invalid",
            status: "planning",
          }),
        ],
        phaseTasks: {},
      }),
    })

    expect(screen.getByText(/Phase 0/)).toBeInTheDocument()
  })

  it("applies focus semantics when section is focused", () => {
    const { container } = renderTimelineView({ isSectionFocused: true, activeIndex: 1 })

    expect(phaseById(container, "phase2")).toHaveAttribute("data-focused", "true")
    expect(phaseById(container, "phase2")).toHaveAttribute("id", "phase-phase2")
    expect(container.querySelector('[role="listbox"]')).toHaveAttribute(
      "aria-activedescendant",
      "phase-phase2",
    )
  })

  it("does not set aria-activedescendant when section is not focused", () => {
    const { container } = renderTimelineView({ isSectionFocused: false, activeIndex: 1 })

    expect(container.querySelector('[role="listbox"]')).not.toHaveAttribute(
      "aria-activedescendant",
    )
  })

  it("adds id attribute to all phase items", () => {
    const { container } = renderTimelineView()

    expect(phaseById(container, "phase1")).toHaveAttribute("id", "phase-phase1")
    expect(phaseById(container, "phase2")).toHaveAttribute("id", "phase-phase2")
    expect(phaseById(container, "phase3")).toHaveAttribute("id", "phase-phase3")
  })
})
