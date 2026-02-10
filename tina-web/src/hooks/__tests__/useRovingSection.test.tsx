import { afterEach, describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { RuntimeProvider, useServices } from "@/providers/RuntimeProvider"
import { useRovingSection } from "../useRovingSection"

function wrapper({ children }: { children: ReactNode }) {
  return <RuntimeProvider>{children}</RuntimeProvider>
}

function addFocusableItem(id: string): HTMLButtonElement {
  const button = document.createElement("button")
  button.id = id
  button.type = "button"
  document.body.appendChild(button)
  return button
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("useRovingSection", () => {
  it("moves DOM focus with the active roving item", () => {
    const first = addFocusableItem("item-0")
    const second = addFocusableItem("item-1")
    addFocusableItem("item-2")

    const { result } = renderHook(
      () => {
        const services = useServices()
        const roving = useRovingSection({
          sectionId: "taskList",
          itemCount: 3,
          getItemDomId: (index) => `item-${index}`,
        })
        return { services, roving }
      },
      { wrapper },
    )

    expect(document.activeElement).toBe(first)
    expect(result.current.roving.activeDescendantId).toBe("item-0")

    act(() => {
      result.current.services.focusService.moveItem(1)
    })

    expect(result.current.roving.activeDescendantId).toBe("item-1")
    expect(document.activeElement).toBe(second)
  })

  it("does not steal focus when an aria-modal dialog is open", () => {
    addFocusableItem("item-0")
    addFocusableItem("item-1")

    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    dialog.setAttribute("aria-modal", "true")
    dialog.tabIndex = -1
    document.body.appendChild(dialog)
    dialog.focus()

    const { result } = renderHook(
      () => {
        const services = useServices()
        useRovingSection({
          sectionId: "taskList",
          itemCount: 2,
          getItemDomId: (index) => `item-${index}`,
        })
        return services
      },
      { wrapper },
    )

    expect(document.activeElement).toBe(dialog)

    act(() => {
      result.current.focusService.moveItem(1)
    })

    expect(document.activeElement).toBe(dialog)
  })
})
