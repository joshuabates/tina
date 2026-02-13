import { screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { expect, it, type Mock } from "vitest"
import { assertDialogFocusTrap } from "@/test/harness/quicklook"

interface QuicklookDialogContractOptions {
  renderDialog: () => void
  onClose: Mock
  firstFocusable?: () => HTMLElement
}

export function defineQuicklookDialogContract({
  renderDialog,
  onClose,
  firstFocusable: getFirstFocusable,
}: QuicklookDialogContractOptions) {
  it.each(["{Escape}", " "])("closes modal on key %s", async (key) => {
    const user = userEvent.setup()
    onClose.mockClear()
    renderDialog()

    await user.keyboard(key)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it("traps focus inside modal", async () => {
    const user = userEvent.setup()
    renderDialog()

    const modal = screen.getByRole("dialog")
    const firstElement = getFirstFocusable
      ? getFirstFocusable()
      : screen.getByRole("button", { name: /close/i })
    await assertDialogFocusTrap(user, modal, firstElement)
  })

  it("receives focus on mount", () => {
    renderDialog()
    expect(screen.getByRole("dialog")).toHaveFocus()
  })

  it("renders as a dialog with appropriate ARIA attributes", () => {
    renderDialog()

    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAttribute("aria-labelledby")
  })
}
