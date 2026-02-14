import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NewSessionDialog } from "../NewSessionDialog"

describe("NewSessionDialog", () => {
  const onClose = vi.fn()
  const onCreated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  function renderDialog() {
    return render(
      <NewSessionDialog onClose={onClose} onCreated={onCreated} />,
    )
  }

  describe("rendering", () => {
    it("renders a dialog with 'New Session' title", () => {
      renderDialog()
      expect(
        screen.getByRole("dialog", { name: /new session/i }),
      ).toBeInTheDocument()
    })

    it("renders a label input", () => {
      renderDialog()
      expect(screen.getByLabelText(/label/i)).toBeInTheDocument()
    })

    it("renders a CLI select defaulting to claude", () => {
      renderDialog()
      const select = screen.getByLabelText(/cli/i) as HTMLSelectElement
      expect(select.value).toBe("claude")
    })

    it("renders Cancel and Create buttons", () => {
      renderDialog()
      expect(
        screen.getByRole("button", { name: /cancel/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: /^create$/i }),
      ).toBeInTheDocument()
    })

    it("disables Create button when label is empty", () => {
      renderDialog()
      expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled()
    })
  })

  describe("interactions", () => {
    it("enables Create button when label has text", async () => {
      const user = userEvent.setup()
      renderDialog()

      await user.type(screen.getByLabelText(/label/i), "My session")
      expect(
        screen.getByRole("button", { name: /^create$/i }),
      ).toBeEnabled()
    })

    it("calls onClose when Cancel is clicked", async () => {
      const user = userEvent.setup()
      renderDialog()

      await user.click(screen.getByRole("button", { name: /cancel/i }))
      expect(onClose).toHaveBeenCalled()
    })

    it("allows switching CLI to codex", async () => {
      const user = userEvent.setup()
      renderDialog()

      await user.selectOptions(screen.getByLabelText(/cli/i), "codex")
      expect((screen.getByLabelText(/cli/i) as HTMLSelectElement).value).toBe(
        "codex",
      )
    })
  })

  describe("form submission", () => {
    it("submits with label and cli, calls onCreated on success", async () => {
      const user = userEvent.setup()
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionName: "session-1",
            tmuxPaneId: "%42",
          }),
      })
      vi.stubGlobal("fetch", mockFetch)

      renderDialog()

      await user.type(screen.getByLabelText(/label/i), "Auth discussion")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sessions"),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: "Auth discussion", cli: "claude" }),
        }),
      )
      expect(onCreated).toHaveBeenCalledWith("%42")
    })

    it("submits with codex CLI when selected", async () => {
      const user = userEvent.setup()
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionName: "session-1",
            tmuxPaneId: "%42",
          }),
      })
      vi.stubGlobal("fetch", mockFetch)

      renderDialog()

      await user.type(screen.getByLabelText(/label/i), "Test")
      await user.selectOptions(screen.getByLabelText(/cli/i), "codex")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/sessions"),
        expect.objectContaining({
          body: JSON.stringify({ label: "Test", cli: "codex" }),
        }),
      )
    })

    it("trims whitespace from label before submitting", async () => {
      const user = userEvent.setup()
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sessionName: "s1",
            tmuxPaneId: "%1",
          }),
      })
      vi.stubGlobal("fetch", mockFetch)

      renderDialog()

      await user.type(screen.getByLabelText(/label/i), "  padded  ")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ label: "padded", cli: "claude" }),
        }),
      )
    })

    it("shows error message on fetch failure", async () => {
      const user = userEvent.setup()
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("Internal Server Error", { status: 500 }),
        ),
      )

      renderDialog()

      await user.type(screen.getByLabelText(/label/i), "Test")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(
        screen.getByText(/Daemon \/sessions: 500 Internal Server Error/),
      ).toBeInTheDocument()
    })

    it("shows error message on network error", async () => {
      const user = userEvent.setup()
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      )

      renderDialog()

      await user.type(screen.getByLabelText(/label/i), "Test")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(screen.getByText("Network error")).toBeInTheDocument()
    })

    it("shows 'Creating...' on submit button while submitting", async () => {
      const user = userEvent.setup()
      let resolvePromise: (value: unknown) => void
      const pending = new Promise((resolve) => {
        resolvePromise = resolve
      })
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending))

      renderDialog()

      await user.type(screen.getByLabelText(/label/i), "Test")
      await user.click(screen.getByRole("button", { name: /^create$/i }))

      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled()

      resolvePromise!({
        ok: true,
        json: () =>
          Promise.resolve({ sessionName: "s", tmuxPaneId: "%1" }),
      })
    })

    it("does not submit when label is only whitespace", async () => {
      const user = userEvent.setup()
      const mockFetch = vi.fn()
      vi.stubGlobal("fetch", mockFetch)

      renderDialog()

      await user.type(screen.getByLabelText(/label/i), "   ")

      // Button should still be disabled since trimmed label is empty
      expect(screen.getByRole("button", { name: /^create$/i })).toBeDisabled()
    })
  })
})
