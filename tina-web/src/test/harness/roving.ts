import { expect } from "vitest"

interface RovingFocusSpec {
  container: HTMLElement
  listRole?: string
  itemIds: readonly string[]
  activeId?: string | null
  focusedAttr?: string
  expectActiveDescendant?: boolean
}

export function assertRovingFocus({
  container,
  listRole = "listbox",
  itemIds,
  activeId = null,
  focusedAttr = "data-focused",
  expectActiveDescendant = activeId !== null,
}: RovingFocusSpec) {
  const list = container.querySelector(`[role="${listRole}"]`)
  expect(list).toBeTruthy()

  if (expectActiveDescendant) {
    expect(list).toHaveAttribute("aria-activedescendant", activeId ?? undefined)
  } else {
    expect(list).not.toHaveAttribute("aria-activedescendant")
  }

  for (const id of itemIds) {
    const item = container.querySelector(`#${id}`)
    expect(item).toBeTruthy()
    expect(item).toHaveAttribute("tabIndex", id === activeId ? "0" : "-1")
    if (focusedAttr) {
      if (id === activeId) {
        expect(item).toHaveAttribute(focusedAttr, "true")
      } else {
        expect(item).not.toHaveAttribute(focusedAttr)
      }
    }
  }
}
