import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Option } from "effect"
import { StatusSection } from "../StatusSection"
import type { OrchestrationDetail } from "@/schemas"

// Mock hooks
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useActionRegistration")

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable

describe("StatusSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
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
    totalPhases: 5,
    currentPhase: 3,
    status: "executing",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: Option.none(),
    totalElapsedMins: Option.some(44),
    nodeName: "test-node",
    phases: [],
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [],
    ...overrides,
  })

  it("shows correct status badge for orchestration status", () => {
    const detail = createMockDetail({ status: "executing" })

    render(<StatusSection detail={detail} />)

    expect(screen.getByText("executing")).toBeInTheDocument()
  })

  it("shows status badge for each orchestration status", () => {
    const statuses = ["planning", "executing", "reviewing", "complete", "blocked"]

    statuses.forEach((status) => {
      const { container } = render(
        <StatusSection detail={createMockDetail({ status })} />
      )

      expect(screen.getByText(status)).toBeInTheDocument()

      // Clean up for next iteration
      container.remove()
    })
  })

  it("shows phase progress as 'Phase X/Y'", () => {
    const detail = createMockDetail({
      currentPhase: 3,
      totalPhases: 5,
    })

    render(<StatusSection detail={detail} />)

    expect(screen.getByText(/Phase 3\/5/i)).toBeInTheDocument()
  })

  it("shows elapsed time when available", () => {
    const detail = createMockDetail({
      totalElapsedMins: Option.some(44),
    })

    render(<StatusSection detail={detail} />)

    expect(screen.getByText(/44m/)).toBeInTheDocument()
  })

  it("shows '--' for elapsed time when not available", () => {
    const detail = createMockDetail({
      totalElapsedMins: Option.none(),
    })

    render(<StatusSection detail={detail} />)

    expect(screen.getByText(/--/)).toBeInTheDocument()
  })

  it("registers rightPanel.status focus section", () => {
    const detail = createMockDetail()

    render(<StatusSection detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.status", expect.any(Number))
  })

  it("renders 'Design Plan' button", () => {
    const detail = createMockDetail({
      designDocPath: "/docs/design.md",
    })

    render(<StatusSection detail={detail} />)

    expect(screen.getByText("Design Plan")).toBeInTheDocument()
  })

  it("renders 'Phase Plan' button", () => {
    const detail = createMockDetail()

    render(<StatusSection detail={detail} />)

    expect(screen.getByText("Phase Plan")).toBeInTheDocument()
  })

  it("uses PanelSection for layout with 'Status' label", () => {
    const detail = createMockDetail()

    render(<StatusSection detail={detail} />)

    expect(screen.getByText("Status")).toBeInTheDocument()
  })

  it("maps status to lowercase for StatusBadge", () => {
    const detail = createMockDetail({ status: "EXECUTING" })

    render(<StatusSection detail={detail} />)

    // StatusBadge should receive lowercase status
    expect(screen.getByText("executing")).toBeInTheDocument()
  })

  it("action buttons have accessible aria-labels", () => {
    const detail = createMockDetail()

    render(<StatusSection detail={detail} />)

    // Design Plan button should have aria-label
    const designButton = screen.getByRole("button", { name: "Open design plan" })
    expect(designButton).toBeInTheDocument()
    expect(designButton).toHaveAccessibleName("Open design plan")

    // Phase Plan button should have aria-label
    const phaseButton = screen.getByRole("button", { name: "Open phase plan" })
    expect(phaseButton).toBeInTheDocument()
    expect(phaseButton).toHaveAccessibleName("Open phase plan")
  })
})
