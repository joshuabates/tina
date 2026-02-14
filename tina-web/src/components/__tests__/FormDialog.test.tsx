import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FormDialog } from "../FormDialog"

describe("FormDialog", () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders title and children", () => {
    render(
      <FormDialog title="Create Ticket" onClose={onClose}>
        <p>Form content</p>
      </FormDialog>,
    )

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText("Create Ticket")).toBeInTheDocument()
    expect(screen.getByText("Form content")).toBeInTheDocument()
  })

  it("has correct ARIA attributes", () => {
    render(
      <FormDialog title="Edit Spec" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAttribute("aria-labelledby")
  })

  it("closes on Escape key", async () => {
    const user = userEvent.setup()
    render(
      <FormDialog title="Test" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("does NOT close on Space key (needed for form inputs)", async () => {
    const user = userEvent.setup()
    render(
      <FormDialog title="Test" onClose={onClose}>
        <input type="text" data-testid="text-input" />
      </FormDialog>,
    )

    const input = screen.getByTestId("text-input")
    await user.click(input)
    await user.keyboard(" ")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes on backdrop click", async () => {
    const user = userEvent.setup()
    render(
      <FormDialog title="Test" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    const backdrop = screen.getByRole("dialog").parentElement!
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("does NOT close when clicking inside the modal", async () => {
    const user = userEvent.setup()
    render(
      <FormDialog title="Test" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    await user.click(screen.getByText("Content"))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("renders close button", () => {
    render(
      <FormDialog title="Test" onClose={onClose}>
        <p>Content</p>
      </FormDialog>,
    )

    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument()
  })
})
