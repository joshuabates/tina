import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StatusSection } from "../StatusSection"
import { buildOrchestrationDetail, none, some } from "@/test/builders/domain"
import { focusableState } from "@/test/harness/hooks"
import { expectStatusLabelUpperVisible } from "@/test/harness/status"

vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useActionRegistration")

const mockEnqueue = vi.fn()
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => mockEnqueue),
  }
})

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable

const baseDetail = buildOrchestrationDetail({
  _id: "orch1",
  _creationTime: 1234567890,
  nodeId: "node1",
  featureName: "test-feature",
  specDocPath: "/docs/test.md",
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

function renderStatusWithUser(overrides: Partial<typeof baseDetail> = {}) {
  const user = userEvent.setup()
  const result = render(
    <StatusSection
      detail={{
        ...baseDetail,
        ...overrides,
      }}
    />,
  )
  return { ...result, user }
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
    renderStatus({ specDocPath: "/docs/spec.md" })

    expect(screen.getByText("Spec")).toBeInTheDocument()
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

    const specButton = screen.getByRole("button", { name: "Open spec" })
    expect(specButton).toBeInTheDocument()
    expect(specButton).toHaveAccessibleName("Open spec")

    const phaseButton = screen.getByRole("button", { name: "Open phase plan" })
    expect(phaseButton).toBeInTheDocument()
    expect(phaseButton).toHaveAccessibleName("Open phase plan")
  })

  describe("control buttons", () => {
    it("renders pause, resume, and retry buttons", () => {
      renderStatus()

      expect(screen.getByTestId("control-pause")).toBeInTheDocument()
      expect(screen.getByTestId("control-resume")).toBeInTheDocument()
      expect(screen.getByTestId("control-retry")).toBeInTheDocument()
    })

    it("enables pause when status is executing", () => {
      renderStatus({ status: "executing" })

      expect(screen.getByTestId("control-pause")).not.toBeDisabled()
    })

    it("disables pause when status is blocked", () => {
      renderStatus({ status: "blocked" })

      expect(screen.getByTestId("control-pause")).toBeDisabled()
    })

    it("enables resume when status is blocked", () => {
      renderStatus({ status: "blocked" })

      expect(screen.getByTestId("control-resume")).not.toBeDisabled()
    })

    it("disables resume when status is executing", () => {
      renderStatus({ status: "executing" })

      expect(screen.getByTestId("control-resume")).toBeDisabled()
    })

    it("enables retry when status is blocked", () => {
      renderStatus({ status: "blocked" })

      expect(screen.getByTestId("control-retry")).not.toBeDisabled()
    })

    it("disables retry when status is executing", () => {
      renderStatus({ status: "executing" })

      expect(screen.getByTestId("control-retry")).toBeDisabled()
    })

    it("shows all buttons disabled when status is complete", () => {
      renderStatus({ status: "complete" })

      expect(screen.getByTestId("control-pause")).toBeDisabled()
      expect(screen.getByTestId("control-resume")).toBeDisabled()
      expect(screen.getByTestId("control-retry")).toBeDisabled()
    })

    it("calls enqueueControlAction on pause click", async () => {
      const { user } = renderStatusWithUser({ status: "executing" })
      mockEnqueue.mockResolvedValue("action-id")

      await user.click(screen.getByTestId("control-pause"))

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrationId: "orch1",
          nodeId: "node1",
          actionType: "pause",
          requestedBy: "web-ui",
        }),
      )
    })

    it("calls enqueueControlAction on resume click", async () => {
      const { user } = renderStatusWithUser({ status: "blocked" })
      mockEnqueue.mockResolvedValue("action-id")

      await user.click(screen.getByTestId("control-resume"))

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrationId: "orch1",
          nodeId: "node1",
          actionType: "resume",
          requestedBy: "web-ui",
        }),
      )
    })

    it("includes phase in pause payload", async () => {
      const { user } = renderStatusWithUser({ status: "executing", currentPhase: 3 })
      mockEnqueue.mockResolvedValue("action-id")

      await user.click(screen.getByTestId("control-pause"))

      const call = mockEnqueue.mock.calls[0][0]
      const payload = JSON.parse(call.payload)
      expect(payload.phase).toBe("3")
      expect(payload.feature).toBe("test-feature")
    })

    it("omits phase in resume payload", async () => {
      const { user } = renderStatusWithUser({ status: "blocked" })
      mockEnqueue.mockResolvedValue("action-id")

      await user.click(screen.getByTestId("control-resume"))

      const call = mockEnqueue.mock.calls[0][0]
      const payload = JSON.parse(call.payload)
      expect(payload.phase).toBeUndefined()
      expect(payload.feature).toBe("test-feature")
    })

    it("shows error message when action fails", async () => {
      const { user } = renderStatusWithUser({ status: "executing" })
      mockEnqueue.mockRejectedValue(new Error("Network error"))

      await user.click(screen.getByTestId("control-pause"))

      expect(screen.getByRole("alert")).toHaveTextContent("Network error")
    })

    it("has accessible aria-labels on control buttons", () => {
      renderStatus()

      expect(screen.getByRole("button", { name: "Pause orchestration" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Resume orchestration" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Retry orchestration phase" })).toBeInTheDocument()
    })
  })
})
