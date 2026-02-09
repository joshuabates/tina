import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createKeyboardService } from "../keyboard-service"
import type { ActionRegistry, ActionContext } from "../action-registry"
import type { FocusService } from "../focus-service"

describe("KeyboardService", () => {
  let actionRegistry: ActionRegistry
  let focusService: FocusService
  let mockExecute: (ctx: ActionContext) => void

  beforeEach(() => {
    // Mock ActionRegistry
    mockExecute = vi.fn() as unknown as (ctx: ActionContext) => void
    actionRegistry = {
      register: vi.fn(),
      get: vi.fn(),
      resolve: vi.fn(),
      listForScope: vi.fn(),
      listAll: vi.fn(),
    }

    // Mock FocusService
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

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("Tab navigation", () => {
    it("Tab dispatches to focusNextSection", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(focusService.focusNextSection).toHaveBeenCalledOnce()
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })

    it("Shift+Tab dispatches to focusPrevSection", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(focusService.focusPrevSection).toHaveBeenCalledOnce()
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })
  })

  describe("Arrow key navigation", () => {
    it("ArrowDown dispatches to moveItem(1)", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(focusService.moveItem).toHaveBeenCalledWith(1)
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })

    it("ArrowUp dispatches to moveItem(-1)", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(focusService.moveItem).toHaveBeenCalledWith(-1)
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })

    it("ArrowRight dispatches to moveItem(1)", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(focusService.moveItem).toHaveBeenCalledWith(1)
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })

    it("ArrowLeft dispatches to moveItem(-1)", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(focusService.moveItem).toHaveBeenCalledWith(-1)
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })
  })

  describe("Scoped action keybinding resolution", () => {
    it("resolves focused-section action bindings", () => {
      const mockAction = {
        id: "delete-item",
        label: "Delete",
        key: "d",
        when: "sidebar.focused",
        execute: mockExecute as (ctx: ActionContext) => void,
      }

      vi.mocked(actionRegistry.resolve).mockImplementation((key, scope) => {
        if (key === "d" && scope === "sidebar.focused") return mockAction
        return undefined
      })

      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "d",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(actionRegistry.resolve).toHaveBeenCalledWith("d", "sidebar.focused")
      expect(mockExecute).toHaveBeenCalledWith({
        selectedItem: "0",
        focusedSection: "sidebar",
      })
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })

    it("resolves global action bindings as fallback", () => {
      const mockAction = {
        id: "open-command-palette",
        label: "Command Palette",
        key: "Ctrl+p",
        when: undefined,
        execute: mockExecute as (ctx: ActionContext) => void,
      }

      vi.mocked(actionRegistry.resolve).mockImplementation((key, scope) => {
        if (key === "Ctrl+p" && scope === "global") return mockAction
        return undefined
      })

      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "p",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(actionRegistry.resolve).toHaveBeenCalledWith("Ctrl+p", "global")
      expect(mockExecute).toHaveBeenCalledWith({
        selectedItem: undefined,
        focusedSection: "sidebar",
      })
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })
  })

  describe("Editable target filtering", () => {
    it("ignores events from input elements", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const input = document.createElement("input")
      document.body.appendChild(input)

      const event = new KeyboardEvent("keydown", {
        key: "d",
        bubbles: true,
        cancelable: true,
      })
      input.dispatchEvent(event)

      expect(actionRegistry.resolve).not.toHaveBeenCalled()
      expect(focusService.moveItem).not.toHaveBeenCalled()

      document.body.removeChild(input)
      service.detach()
    })

    it("ignores events from textarea elements", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const textarea = document.createElement("textarea")
      document.body.appendChild(textarea)

      const event = new KeyboardEvent("keydown", {
        key: "d",
        bubbles: true,
        cancelable: true,
      })
      textarea.dispatchEvent(event)

      expect(actionRegistry.resolve).not.toHaveBeenCalled()
      expect(focusService.moveItem).not.toHaveBeenCalled()

      document.body.removeChild(textarea)
      service.detach()
    })

    it("ignores events from contentEditable elements", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const div = document.createElement("div")
      div.contentEditable = "true"
      document.body.appendChild(div)

      const event = new KeyboardEvent("keydown", {
        key: "d",
        bubbles: true,
        cancelable: true,
      })
      div.dispatchEvent(event)

      expect(actionRegistry.resolve).not.toHaveBeenCalled()
      expect(focusService.moveItem).not.toHaveBeenCalled()

      document.body.removeChild(div)
      service.detach()
    })

    it("processes events from non-editable elements", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const div = document.createElement("div")
      document.body.appendChild(div)

      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      })
      div.dispatchEvent(event)

      expect(focusService.moveItem).toHaveBeenCalledWith(1)

      document.body.removeChild(div)
      service.detach()
    })
  })

  describe("Modal scope precedence", () => {
    it("modal scope takes precedence over other bindings", () => {
      const modalAction = {
        id: "confirm",
        label: "Confirm",
        key: "Enter",
        when: "modal",
        execute: mockExecute as (ctx: ActionContext) => void,
      }

      vi.mocked(actionRegistry.resolve).mockImplementation((key, scope) => {
        if (key === "Enter" && scope === "modal") return modalAction
        return undefined
      })

      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()
      service.setModalScope("modal")

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(actionRegistry.resolve).toHaveBeenCalledWith("Enter", "modal")
      expect(mockExecute).toHaveBeenCalledWith({
        selectedItem: undefined,
        focusedSection: "modal",
      })
      expect(event.defaultPrevented).toBe(true)

      service.detach()
    })

    it("modal scope allows events from editable elements", () => {
      const modalAction = {
        id: "confirm",
        label: "Confirm",
        key: "Ctrl+Enter",
        when: "modal",
        execute: mockExecute as (ctx: ActionContext) => void,
      }

      vi.mocked(actionRegistry.resolve).mockImplementation((key, scope) => {
        if (key === "Ctrl+Enter" && scope === "modal") return modalAction
        return undefined
      })

      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()
      service.setModalScope("modal")

      const input = document.createElement("input")
      document.body.appendChild(input)

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      input.dispatchEvent(event)

      expect(actionRegistry.resolve).toHaveBeenCalledWith("Ctrl+Enter", "modal")
      expect(mockExecute).toHaveBeenCalled()

      document.body.removeChild(input)
      service.detach()
    })

    it("clearing modal scope restores normal behavior", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()
      service.setModalScope("modal")
      service.setModalScope(null)

      const input = document.createElement("input")
      document.body.appendChild(input)

      const event = new KeyboardEvent("keydown", {
        key: "d",
        bubbles: true,
        cancelable: true,
      })
      input.dispatchEvent(event)

      expect(actionRegistry.resolve).not.toHaveBeenCalled()

      document.body.removeChild(input)
      service.detach()
    })
  })

  describe("normalizeKey", () => {
    it("handles single modifier + key", () => {
      const mockAction = {
        id: "test",
        label: "Test",
        execute: mockExecute as (ctx: ActionContext) => void,
      }

      vi.mocked(actionRegistry.resolve).mockImplementation((key, scope) => {
        if (key === "Alt+a" && scope === "global") return mockAction
        return undefined
      })

      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "a",
        altKey: true,
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(actionRegistry.resolve).toHaveBeenCalledWith("Alt+a", "global")

      service.detach()
    })

    it("handles multiple modifiers in order", () => {
      const mockAction = {
        id: "test",
        label: "Test",
        execute: mockExecute as (ctx: ActionContext) => void,
      }

      vi.mocked(actionRegistry.resolve).mockImplementation((key, scope) => {
        if (key === "Alt+Ctrl+Shift+a" && scope === "global") return mockAction
        return undefined
      })

      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "a",
        altKey: true,
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(actionRegistry.resolve).toHaveBeenCalledWith(
        "Alt+Ctrl+Shift+a",
        "global"
      )

      service.detach()
    })

    it("handles Meta modifier", () => {
      const mockAction = {
        id: "test",
        label: "Test",
        execute: mockExecute as (ctx: ActionContext) => void,
      }

      vi.mocked(actionRegistry.resolve).mockImplementation((key, scope) => {
        if (key === "Meta+k" && scope === "global") return mockAction
        return undefined
      })

      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(actionRegistry.resolve).toHaveBeenCalledWith("Meta+k", "global")

      service.detach()
    })

    it("handles all modifiers together", () => {
      const mockAction = {
        id: "test",
        label: "Test",
        execute: mockExecute as (ctx: ActionContext) => void,
      }

      vi.mocked(actionRegistry.resolve).mockImplementation((key, scope) => {
        if (key === "Alt+Ctrl+Meta+Shift+x" && scope === "global")
          return mockAction
        return undefined
      })

      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "x",
        altKey: true,
        ctrlKey: true,
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(actionRegistry.resolve).toHaveBeenCalledWith(
        "Alt+Ctrl+Meta+Shift+x",
        "global"
      )

      service.detach()
    })
  })

  describe("IME composition", () => {
    it("ignores events during IME composition", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
        cancelable: true,
        isComposing: true,
      })
      document.dispatchEvent(event)

      expect(actionRegistry.resolve).not.toHaveBeenCalled()
      expect(focusService.moveItem).not.toHaveBeenCalled()

      service.detach()
    })
  })

  describe("attach/detach", () => {
    it("does not handle events when detached", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()
      service.detach()

      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      expect(focusService.moveItem).not.toHaveBeenCalled()
    })

    it("can be attached multiple times safely", () => {
      const service = createKeyboardService({ actionRegistry, focusService })
      service.attach()
      service.attach()

      const event = new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)

      // Should only be called once, not twice
      expect(focusService.moveItem).toHaveBeenCalledOnce()

      service.detach()
    })
  })
})
