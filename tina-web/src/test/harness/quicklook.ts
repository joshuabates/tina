import { expect } from "vitest"
import type { UserEvent } from "@testing-library/user-event"

export async function assertDialogFocusTrap(
  user: UserEvent,
  dialog: HTMLElement,
  firstFocusable: HTMLElement,
) {
  expect(dialog).toHaveFocus()

  await user.tab()
  expect(firstFocusable).toHaveFocus()

  await user.tab()
  expect(dialog.contains(document.activeElement)).toBe(true)
}
