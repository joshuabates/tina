import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatusSection } from "../StatusSection"
import { buildOrchestrationDetail, none, some } from "@/test/builders/domain"
import { focusableState } from "@/test/harness/hooks"
import { expectStatusLabelUpperVisible } from "@/test/harness/status"

vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useActionRegistration")

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable

const baseDetail = buildOrchestrationDetail({
  _id: "orch1",
  _creationTime: 1234567890,
  nodeId: "node1",
  featureName: "test-feature",
  designDocPath: "/docs/test.md",
  branch: "tina/test-feature",
  worktreePath: none<string>(),
  totalPhases: 5,
  currentPhase: 3,
  status: "executing",
  startedAt: "2024-01-01T10:00:00Z",
  completedAt: none<string>(),
  totalElapsedMins: some(44),
  nodeName: "test-node",
  phases: [],
  phaseTasks: {},
  teamMembers: [],
})

function renderStatus(overrides: Partial<typeof baseDetail> = {}) {
  return render(
    <StatusSection
      detail={{
        ...baseDetail,
        ...overrides,
      }}
    />,
  )
}

describe("StatusSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseFocusable.mockReturnValue(focusableState())
  })

  it("shows correct status badge for orchestration status", () => {
    renderStatus({ status: "executing" })

    expectStatusLabelUpperVisible("executing")
  })

  it("shows status line for each orchestration status", () => {
    const statuses = ["planning", "executing", "reviewing", "complete", "blocked"]

    for (const status of statuses) {
      const { unmount } = renderStatus({ status })
      expectStatusLabelUpperVisible(status)
      unmount()
    }
  })

  it("shows phase progress as 'Phase X/Y'", () => {
    renderStatus({ currentPhase: 3, totalPhases: 5 })

    expect(screen.getByText(/PHASE 3\/5/i)).toBeInTheDocument()
  })

  it("shows elapsed time when available", () => {
    renderStatus({ totalElapsedMins: some(44) })

    expect(screen.getByText(/44m/)).toBeInTheDocument()
  })

  it("shows '--' for elapsed time when not available", () => {
    renderStatus({ totalElapsedMins: none<number>() })

    expect(screen.getByText(/--/)).toBeInTheDocument()
  })

  it("registers rightPanel.status focus section", () => {
    renderStatus()

    expect(mockUseFocusable).toHaveBeenCalledWith(
      "rightPanel.status",
      expect.any(Number),
    )
  })

  it("renders action buttons", () => {
    renderStatus({ designDocPath: "/docs/design.md" })

    expect(screen.getByText("Design Plan")).toBeInTheDocument()
    expect(screen.getByText("Phase Plan")).toBeInTheDocument()
  })

  it("uses orchestration card layout", () => {
    renderStatus()

    expect(screen.getByText("Orchestration")).toBeInTheDocument()
  })

  it("normalizes status text to uppercase", () => {
    renderStatus({ status: "EXECUTING" })

    expectStatusLabelUpperVisible("EXECUTING")
  })

  it("action buttons have accessible aria-labels", () => {
    renderStatus()

    const designButton = screen.getByRole("button", { name: "Open design plan" })
    expect(designButton).toBeInTheDocument()
    expect(designButton).toHaveAccessibleName("Open design plan")

    const phaseButton = screen.getByRole("button", { name: "Open phase plan" })
    expect(phaseButton).toBeInTheDocument()
    expect(phaseButton).toHaveAccessibleName("Open phase plan")
  })
})
