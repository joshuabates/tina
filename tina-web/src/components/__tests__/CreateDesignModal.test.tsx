import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CreateDesignModal } from "../pm/CreateDesignModal"

const mockCreateFn = vi.fn()

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: () => mockCreateFn,
  }
})

describe("CreateDesignModal", () => {
  const onClose = vi.fn()
  const onCreated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateFn.mockResolvedValue("design-1")
  })

  function renderModal() {
    return render(
      <CreateDesignModal
        projectId="p1"
        onClose={onClose}
        onCreated={onCreated}
      />,
    )
  }

  it("renders title and prompt form fields", () => {
    renderModal()

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/prompt/i)).toBeInTheDocument()
  })

  it("submit button disabled when title is empty", () => {
    renderModal()

    expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled()
  })

  it("enables submit button when title is provided", async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByLabelText(/title/i), "My Design")
    expect(screen.getByRole("button", { name: /^create$/i })).toBeEnabled()
  })

  describe("form submission", () => {
    it("calls createDesign mutation with form data", async () => {
      const user = userEvent.setup()
      renderModal()

      await user.type(screen.getByLabelText(/title/i), "My Design")
      await user.type(screen.getByLabelText(/prompt/i), "Design a dashboard")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "My Design",
          prompt: "Design a dashboard",
        }),
      )
    })

    it("calls onCreated with design ID on success", async () => {
      const user = userEvent.setup()
      mockCreateFn.mockResolvedValue("design-123")
      renderModal()

      await user.type(screen.getByLabelText(/title/i), "Test")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(onCreated).toHaveBeenCalledWith("design-123")
    })

    it("displays error message on mutation failure", async () => {
      const user = userEvent.setup()
      mockCreateFn.mockRejectedValue(new Error("Server error"))
      renderModal()

      await user.type(screen.getByLabelText(/title/i), "Test")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(screen.getByText("Server error")).toBeInTheDocument()
    })
  })

  it("closes modal on cancel", async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
