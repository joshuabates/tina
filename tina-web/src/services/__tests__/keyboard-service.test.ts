import { describe, it, expect, vi, beforeEach } from "vitest"
import { createKeyboardService } from "../keyboard-service"
import type { ActionRegistry, ActionContext } from "../action-registry"
import type { FocusService } from "../focus-service"
import { dispatchKeyDown } from "@/test/harness/keyboard"

function press(
  key: string,
  init: Omit<KeyboardEventInit, "key"> = {},
  target: EventTarget = document,
): KeyboardEvent {
  return dispatchKeyDown(target, key, init)
}

describe("KeyboardService", () => {
  let actionRegistry: ActionRegistry
  let focusService: FocusService
  let mockExecute: (ctx: ActionContext) => void

  const sidebarContext = { selectedItem: "0", focusedSection: "sidebar" as const }
  const globalContext = { selectedItem: undefined, focusedSection: "sidebar" as const }
  const modalContext = { selectedItem: undefined, focusedSection: "modal" as const }

  function createService() {
    return createKeyboardService({ actionRegistry, focusService })
  }

  function withAttached(run: (service: ReturnType<typeof createKeyboardService>) => void) {
    const service = createService()
    service.attach()
    try {
      run(service)
    } finally {
      service.detach()
    }
  }

  function withTarget<T extends HTMLElement>(target: T, run: (target: T) => void) {
    document.body.appendChild(target)
    try {
      run(target)
    } finally {
      document.body.removeChild(target)
    }
  }

  function resolvedAction(key: string, scope: string, execute = mockExecute) {
    const action = {
      id: `${scope}-${key}`,
      label: "Action",
      key,
      when: scope === "global" ? undefined : scope,
      execute,
    }

    vi.mocked(actionRegistry.resolve).mockImplementation((candidateKey, candidateScope) => {
      if (candidateKey === key && candidateScope === scope) return action
      return undefined
    })

    return action
  }

  beforeEach(() => {
    mockExecute = vi.fn() as unknown as (ctx: ActionContext) => void
    actionRegistry = {
      register: vi.fn(),
      get: vi.fn(),
      resolve: vi.fn(),
      listForScope: vi.fn(),
      listAll: vi.fn(),
    }

    focusService = {
      subscribe: vi.fn(),
      registerSection: vi.fn(),
      setItemCount: vi.fn(),
      focusSection: vi.fn(),
      focusNextSection: vi.fn(),
      focusPrevSection: vi.fn(),
      moveItem: vi.fn(),
      getState: vi.fn(() => ({
        activeSection: "sidebar",
        activeIndex: 0,
        sections: { sidebar: { itemCount: 3 } },
      })),
    }
  })

  describe("Tab navigation", () => {
    it.each([
      { init: {}, method: "focusNextSection" as const },
      { init: { shiftKey: true }, method: "focusPrevSection" as const },
    ])("dispatches to $method", ({ init, method }) => {
      withAttached(() => {
        const event = press("Tab", init)

        expect(focusService[method]).toHaveBeenCalledOnce()
        expect(event.defaultPrevented).toBe(true)
      })
    })
  })

  describe("Arrow key navigation", () => {
    it.each([
      ["ArrowDown", 1],
      ["ArrowRight", 1],
      ["ArrowUp", -1],
      ["ArrowLeft", -1],
    ])("%s dispatches to moveItem(%s)", (key, delta) => {
      withAttached(() => {
        const event = press(key)

        expect(focusService.moveItem).toHaveBeenCalledWith(delta)
        expect(event.defaultPrevented).toBe(true)
      })
    })
  })

  describe("Scoped action keybinding resolution", () => {
    it.each([
      { key: "d", init: {}, scope: "sidebar", context: sidebarContext },
      { key: "d", init: {}, scope: "sidebar.focused", context: sidebarContext },
      {
        key: "p",
        init: { ctrlKey: true },
        scope: "global",
        resolvedKey: "Ctrl+p",
        context: globalContext,
      },
    ])("resolves $scope bindings", ({ key, init, scope, context, resolvedKey }) => {
      const normalizedKey = resolvedKey ?? key
      resolvedAction(normalizedKey, scope)

      withAttached(() => {
        const event = press(key, init)

        expect(actionRegistry.resolve).toHaveBeenCalledWith(normalizedKey, scope)
        expect(mockExecute).toHaveBeenCalledWith(context)
        expect(event.defaultPrevented).toBe(true)
      })
    })
  })

  describe("Editable target filtering", () => {
    it.each([
      ["input", () => document.createElement("input")],
      ["textarea", () => document.createElement("textarea")],
      ["contentEditable", () => {
        const div = document.createElement("div")
        div.contentEditable = "true"
        return div
      }],
    ])("ignores events from %s elements", (_, create) => {
      withAttached(() => {
        withTarget(create(), (target) => {
          press("d", {}, target)

          expect(actionRegistry.resolve).not.toHaveBeenCalled()
          expect(focusService.moveItem).not.toHaveBeenCalled()
        })
      })
    })

    it("processes events from non-editable elements", () => {
      withAttached(() => {
        withTarget(document.createElement("div"), (div) => {
          press("ArrowDown", {}, div)

          expect(focusService.moveItem).toHaveBeenCalledWith(1)
        })
      })
    })
  })

  describe("Modal scope precedence", () => {
    it("takes precedence over other bindings", () => {
      resolvedAction("Enter", "modal")

      withAttached((service) => {
        service.setModalScope("modal")
        const event = press("Enter")

        expect(actionRegistry.resolve).toHaveBeenCalledWith("Enter", "modal")
        expect(mockExecute).toHaveBeenCalledWith(modalContext)
        expect(event.defaultPrevented).toBe(true)
      })
    })

    it("allows events from editable elements", () => {
      resolvedAction("Ctrl+Enter", "modal")

      withAttached((service) => {
        service.setModalScope("modal")

        withTarget(document.createElement("input"), (input) => {
          const event = press("Enter", { ctrlKey: true }, input)

          expect(actionRegistry.resolve).toHaveBeenCalledWith("Ctrl+Enter", "modal")
          expect(mockExecute).toHaveBeenCalledWith(modalContext)
          expect(event.defaultPrevented).toBe(true)
        })
      })
    })

    it("clearing modal scope restores normal behavior", () => {
      withAttached((service) => {
        service.setModalScope("modal")
        service.setModalScope(null)

        withTarget(document.createElement("input"), (input) => {
          press("d", {}, input)

          expect(actionRegistry.resolve).not.toHaveBeenCalled()
        })
      })
    })

    it("blocks background navigation while aria-modal dialog is open", () => {
      withAttached(() => {
        withTarget(document.createElement("div"), (dialog) => {
          dialog.setAttribute("role", "dialog")
          dialog.setAttribute("aria-modal", "true")

          const event = press("Tab")

          expect(focusService.focusNextSection).not.toHaveBeenCalled()
          expect(actionRegistry.resolve).not.toHaveBeenCalled()
          expect(event.defaultPrevented).toBe(false)
        })
      })
    })
  })

  describe("normalizeKey", () => {
    it.each([
      ["a", { altKey: true }, "Alt+a"],
      ["a", { altKey: true, ctrlKey: true, shiftKey: true }, "Alt+Ctrl+Shift+a"],
      ["k", { metaKey: true }, "Meta+k"],
      ["x", { altKey: true, ctrlKey: true, metaKey: true, shiftKey: true }, "Alt+Ctrl+Meta+Shift+x"],
    ])("normalizes to %s", (key, init, normalized) => {
      resolvedAction(normalized, "global")

      withAttached(() => {
        press(key, init)

        expect(actionRegistry.resolve).toHaveBeenCalledWith(normalized, "global")
      })
    })
  })

  it("ignores events during IME composition", () => {
    withAttached(() => {
      press("a", { isComposing: true })

      expect(actionRegistry.resolve).not.toHaveBeenCalled()
      expect(focusService.moveItem).not.toHaveBeenCalled()
    })
  })

  describe("attach/detach", () => {
    it("does not handle events when detached", () => {
      const service = createService()
      service.attach()
      service.detach()

      press("ArrowDown")

      expect(focusService.moveItem).not.toHaveBeenCalled()
    })

    it("can be attached multiple times safely", () => {
      const service = createService()
      service.attach()
      service.attach()

      press("ArrowDown")

      expect(focusService.moveItem).toHaveBeenCalledOnce()

      service.detach()
    })
  })
})
