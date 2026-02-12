import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PolicyConfigPanel } from "../PolicyConfigPanel"

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
}

function renderPanel(props: Partial<typeof defaultProps> = {}) {
  return render(<PolicyConfigPanel {...defaultProps} {...props} />)
}

function renderPanelWithUser(props: Partial<typeof defaultProps> = {}) {
  const user = userEvent.setup()
  const result = render(<PolicyConfigPanel {...defaultProps} {...props} />)
  return { ...result, user }
}

describe("PolicyConfigPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("loading state", () => {
    it("shows loading text when activePolicy is null", () => {
      mockUseQuery.mockReturnValue(null)

      renderPanel()

      expect(screen.getByText("Loading...")).toBeInTheDocument()
      expect(screen.getByText("Policy")).toBeInTheDocument()
    })
  })

  describe("with active policy", () => {
    const activePolicy = {
      modelPolicy: {
        validator: "opus",
        planner: "sonnet",
        executor: "opus",
        reviewer: "haiku",
      },
      reviewPolicy: {},
      policyRevision: 3,
      launchSnapshot: "{}",
      presetOrigin: "balanced",
    }

    beforeEach(() => {
      mockUseQuery.mockReturnValue(activePolicy)
    })

    it("renders all four role selectors", () => {
      renderPanel()

      expect(screen.getByTestId("policy-model-validator")).toBeInTheDocument()
      expect(screen.getByTestId("policy-model-planner")).toBeInTheDocument()
      expect(screen.getByTestId("policy-model-executor")).toBeInTheDocument()
      expect(screen.getByTestId("policy-model-reviewer")).toBeInTheDocument()
    })

    it("shows current model values from policy", () => {
      renderPanel()

      expect(screen.getByTestId("policy-model-validator")).toHaveValue("opus")
      expect(screen.getByTestId("policy-model-planner")).toHaveValue("sonnet")
      expect(screen.getByTestId("policy-model-executor")).toHaveValue("opus")
      expect(screen.getByTestId("policy-model-reviewer")).toHaveValue("haiku")
    })

    it("shows guard text about future actions", () => {
      renderPanel()

      expect(screen.getByText(/applies to future actions only/i)).toBeInTheDocument()
    })

    it("shows preset origin when available", () => {
      renderPanel()

      expect(screen.getByText(/base preset: balanced/i)).toBeInTheDocument()
    })

    it("hides preset origin when not available", () => {
      mockUseQuery.mockReturnValue({
        ...activePolicy,
        presetOrigin: null,
      })

      renderPanel()

      expect(screen.queryByText(/base preset/i)).not.toBeInTheDocument()
    })

    it("defaults to opus when modelPolicy has no value for a role", () => {
      mockUseQuery.mockReturnValue({
        ...activePolicy,
        modelPolicy: {},
      })

      renderPanel()

      expect(screen.getByTestId("policy-model-validator")).toHaveValue("opus")
      expect(screen.getByTestId("policy-model-planner")).toHaveValue("opus")
      expect(screen.getByTestId("policy-model-executor")).toHaveValue("opus")
      expect(screen.getByTestId("policy-model-reviewer")).toHaveValue("opus")
    })

    it("handles null modelPolicy", () => {
      mockUseQuery.mockReturnValue({
        ...activePolicy,
        modelPolicy: null,
      })

      renderPanel()

      expect(screen.getByTestId("policy-model-validator")).toHaveValue("opus")
    })

    it("calls enqueueControlAction when role model changes", async () => {
      mockEnqueue.mockResolvedValue("action-id")
      const { user } = renderPanelWithUser()

      await user.selectOptions(screen.getByTestId("policy-model-planner"), "haiku")

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          orchestrationId: "orch1",
          nodeId: "node1",
          actionType: "orchestration_set_role_model",
          requestedBy: "web-ui",
        }),
      )

      const call = mockEnqueue.mock.calls[0][0]
      const payload = JSON.parse(call.payload)
      expect(payload.role).toBe("planner")
      expect(payload.model).toBe("haiku")
      expect(payload.feature).toBe("test-feature")
      expect(payload.targetRevision).toBe(3)
    })

    it("shows success message after update", async () => {
      mockEnqueue.mockResolvedValue("action-id")
      const { user } = renderPanelWithUser()

      await user.selectOptions(screen.getByTestId("policy-model-executor"), "sonnet")

      expect(screen.getByRole("status")).toHaveTextContent("Updated: executor → sonnet")
    })

    it("shows error message when update fails", async () => {
      mockEnqueue.mockRejectedValue(new Error("Revision conflict"))
      const { user } = renderPanelWithUser()

      await user.selectOptions(screen.getByTestId("policy-model-executor"), "sonnet")

      expect(screen.getByRole("alert")).toHaveTextContent("Revision conflict")
    })

    it("shows generic error for non-Error rejections", async () => {
      mockEnqueue.mockRejectedValue("unknown error")
      const { user } = renderPanelWithUser()

      await user.selectOptions(screen.getByTestId("policy-model-executor"), "sonnet")

      expect(screen.getByRole("alert")).toHaveTextContent("Update failed")
    })

    it("renders within a StatPanel titled Policy", () => {
      renderPanel()

      expect(screen.getByText("Policy")).toBeInTheDocument()
    })
  })
})
