import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import { Option } from "effect"
import { PhaseTimelinePanel } from "../PhaseTimelinePanel"
import type { OrchestrationDetail } from "@/schemas"
import type { ActionContext } from "@/services/action-registry"

// Mock hooks
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection")
).useSelection
const mockUseActionRegistration = vi.mocked(
  await import("@/hooks/useActionRegistration")
).useActionRegistration

describe("PhaseTimelinePanel - Keyboard Navigation", () => {
  let mockSelectPhase: ReturnType<typeof vi.fn<(id: string | null) => void>>
  let mockExecute: ((ctx: ActionContext) => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute = undefined
    mockSelectPhase = vi.fn()

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
    })

    // Default mock for useSelection
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: vi.fn() as any,
      selectPhase: mockSelectPhase as any,
    })

    // Capture execute function from useActionRegistration
    // Note: PhaseTimelinePanel registers multiple actions (Enter and Space)
    // We want to capture the Enter action specifically
    mockUseActionRegistration.mockImplementation((config) => {
      if (config.key === "Enter") {
        mockExecute = config.execute
      }
    })
  })

  const createMockDetail = (overrides?: Partial<OrchestrationDetail>): OrchestrationDetail => ({
    _id: "orch1",
    _creationTime: 1234567890,
    nodeId: "node1",
    featureName: "test-feature",
    designDocPath: "/docs/test.md",
    branch: "tina/test-feature",
    worktreePath: Option.none(),
    totalPhases: 3,
    currentPhase: 1,
    status: "executing",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: Option.none(),
    totalElapsedMins: Option.none(),
    nodeName: "test-node",
    phases: [
      {
        _id: "phase1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: "1",
        status: "executing",
        planPath: Option.some("/path/to/plan1.md"),
        gitRange: Option.none(),
        planningMins: Option.some(10),
        executionMins: Option.some(20),
        reviewMins: Option.none(),
        startedAt: Option.some("2024-01-01T10:00:00Z"),
        completedAt: Option.none(),
      },
      {
        _id: "phase2",
        _creationTime: 1234567891,
        orchestrationId: "orch1",
        phaseNumber: "2",
        status: "planning",
        planPath: Option.none(),
        gitRange: Option.none(),
        planningMins: Option.none(),
        executionMins: Option.none(),
        reviewMins: Option.none(),
        startedAt: Option.none(),
        completedAt: Option.none(),
      },
      {
        _id: "phase3",
        _creationTime: 1234567892,
        orchestrationId: "orch1",
        phaseNumber: "3",
        status: "pending",
        planPath: Option.none(),
        gitRange: Option.none(),
        planningMins: Option.none(),
        executionMins: Option.none(),
        reviewMins: Option.none(),
        startedAt: Option.none(),
        completedAt: Option.none(),
      },
    ],
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [],
    ...overrides,
  })

  describe("Enter key action", () => {
    it("registers Enter action with correct scope", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 0,
      })

      render(<PhaseTimelinePanel detail={detail} />)

      expect(mockUseActionRegistration).toHaveBeenCalledWith({
        id: "phase-timeline-select",
        label: "Select Phase",
        key: "Enter",
        when: "phaseTimeline",
        execute: expect.any(Function),
      })
    })

    it("calls selectPhase with active phase ID when Enter action executes", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Phase 2
      })

      render(<PhaseTimelinePanel detail={detail} />)

      // Execute the registered action
      expect(mockExecute).toBeDefined()
      mockExecute!({})

      expect(mockSelectPhase).toHaveBeenCalledWith("phase2")
    })

    it("does not crash when Enter is pressed with invalid activeIndex", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 999, // Out of bounds
      })

      render(<PhaseTimelinePanel detail={detail} />)

      // Execute should not throw
      expect(() => mockExecute!({})).not.toThrow()
      expect(mockSelectPhase).not.toHaveBeenCalled()
    })

    it("does not crash when Enter is pressed with negative activeIndex", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: -1,
      })

      render(<PhaseTimelinePanel detail={detail} />)

      // Execute should not throw
      expect(() => mockExecute!({})).not.toThrow()
      expect(mockSelectPhase).not.toHaveBeenCalled()
    })
  })

  describe("Roving tabindex", () => {
    it("sets tabindex=0 on focused phase item", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Phase 2
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const phase2Element = container.querySelector('[id="phase-phase2"]')
      expect(phase2Element).toHaveAttribute("tabIndex", "0")
    })

    it("sets tabindex=-1 on non-focused phase items", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Phase 2
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const phase1Element = container.querySelector('[id="phase-phase1"]')
      expect(phase1Element).toHaveAttribute("tabIndex", "-1")

      const phase3Element = container.querySelector('[id="phase-phase3"]')
      expect(phase3Element).toHaveAttribute("tabIndex", "-1")
    })

    it("sets tabindex=-1 on all items when section is not focused", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: false,
        activeIndex: 1,
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const phase1Element = container.querySelector('[id="phase-phase1"]')
      expect(phase1Element).toHaveAttribute("tabIndex", "-1")

      const phase2Element = container.querySelector('[id="phase-phase2"]')
      expect(phase2Element).toHaveAttribute("tabIndex", "-1")

      const phase3Element = container.querySelector('[id="phase-phase3"]')
      expect(phase3Element).toHaveAttribute("tabIndex", "-1")
    })
  })

  describe("aria-activedescendant", () => {
    it("sets aria-activedescendant to focused phase ID when section is focused", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Phase 2
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const timelineContainer = container.querySelector('[aria-activedescendant]')
      expect(timelineContainer).toHaveAttribute("aria-activedescendant", "phase-phase2")
    })

    it("does not set aria-activedescendant when section is not focused", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: false,
        activeIndex: 1,
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const timelineContainer = container.querySelector('.flex.flex-col.gap-8')
      expect(timelineContainer).not.toHaveAttribute("aria-activedescendant")
    })

    it("does not set aria-activedescendant when activeIndex is out of bounds", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 999,
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const timelineContainer = container.querySelector('.flex.flex-col.gap-8')
      expect(timelineContainer).not.toHaveAttribute("aria-activedescendant")
    })
  })

  describe("Focus ring visibility", () => {
    it("shows focus ring on focused phase item", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Phase 2
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const phase2Element = container.querySelector('[id="phase-phase2"]')
      expect(phase2Element).toHaveAttribute("data-focused", "true")
      // Focus styling: ring-2 with muted color
      expect(phase2Element).toHaveClass("ring-2")
    })

    it("distinguishes focus ring from selection ring", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Phase 2 is focused
      })

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase3", // Phase 3 is selected
        selectOrchestration: vi.fn(),
        selectPhase: mockSelectPhase,
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      // Phase 2 should have focus ring (muted color)
      const phase2Element = container.querySelector('[id="phase-phase2"]')
      expect(phase2Element).toHaveClass("ring-2")
      expect(phase2Element).toHaveClass("ring-muted-foreground/40")

      // Phase 3 should have selection ring (primary color)
      const phase3Element = container.querySelector('[id="phase-phase3"]')
      expect(phase3Element).toHaveClass("ring-2", "ring-primary")
    })

    it("shows both focus and selection styling when same phase", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 1, // Phase 2
      })

      mockUseSelection.mockReturnValue({
        orchestrationId: "orch1",
        phaseId: "phase2", // Phase 2 also selected
        selectOrchestration: vi.fn(),
        selectPhase: mockSelectPhase,
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const phase2Element = container.querySelector('[id="phase-phase2"]')
      // Should have both focus and selection styling
      // When both are active, selection ring takes precedence (applied last)
      expect(phase2Element).toHaveClass("ring-2", "ring-primary")
    })
  })

  describe("Focus section registration", () => {
    it("registers phaseTimeline section with correct item count", () => {
      const detail = createMockDetail()

      render(<PhaseTimelinePanel detail={detail} />)

      expect(mockUseFocusable).toHaveBeenCalledWith("phaseTimeline", 3)
    })

    it("updates item count when phases change", () => {
      const detail = createMockDetail()

      const { rerender } = render(<PhaseTimelinePanel detail={detail} />)

      expect(mockUseFocusable).toHaveBeenCalledWith("phaseTimeline", 3)

      // Update with fewer phases
      const updatedDetail = createMockDetail({
        phases: detail.phases.slice(0, 2),
        totalPhases: 2,
      })

      rerender(<PhaseTimelinePanel detail={updatedDetail} />)

      expect(mockUseFocusable).toHaveBeenCalledWith("phaseTimeline", 2)
    })
  })

  describe("Phase item IDs", () => {
    it("sets unique id attribute for each phase item", () => {
      const detail = createMockDetail()

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const phase1Element = container.querySelector('[id="phase-phase1"]')
      expect(phase1Element).toHaveAttribute("id", "phase-phase1")

      const phase2Element = container.querySelector('[id="phase-phase2"]')
      expect(phase2Element).toHaveAttribute("id", "phase-phase2")

      const phase3Element = container.querySelector('[id="phase-phase3"]')
      expect(phase3Element).toHaveAttribute("id", "phase-phase3")
    })

    it("id attribute matches aria-activedescendant format", () => {
      const detail = createMockDetail()

      mockUseFocusable.mockReturnValue({
        isSectionFocused: true,
        activeIndex: 0,
      })

      const { container } = render(<PhaseTimelinePanel detail={detail} />)

      const timelineContainer = container.querySelector('[aria-activedescendant]')
      const activeDescendantId = timelineContainer?.getAttribute("aria-activedescendant")

      const phase1Element = container.querySelector('[id="phase-phase1"]')
      const phase1Id = phase1Element?.getAttribute("id")

      expect(activeDescendantId).toBe(phase1Id)
    })
  })
})
