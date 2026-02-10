import type { ActionRegistry } from "./action-registry"
import type { FocusService } from "./focus-service"

export interface KeyboardServiceConfig {
  actionRegistry: ActionRegistry
  focusService: FocusService
}

export function createKeyboardService(config: KeyboardServiceConfig) {
  const { actionRegistry, focusService } = config
  let attached = false
  let modalScope: string | null = null

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName.toLowerCase()
    if (tag === "input" || tag === "textarea") return true
    // contentEditable can be "true", "false", or "inherit"
    if (
      target.contentEditable === "true" ||
      target.isContentEditable === true
    )
      return true
    return false
  }

  function normalizeKey(e: KeyboardEvent): string {
    const parts: string[] = []
    if (e.altKey) parts.push("Alt")
    if (e.ctrlKey) parts.push("Ctrl")
    if (e.metaKey) parts.push("Meta")
    if (e.shiftKey) parts.push("Shift")
    parts.push(e.key)
    return parts.join("+")
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Ignore IME composition
    if (e.isComposing) return

    // Ignore editable elements unless modal is open
    if (!modalScope && isEditableTarget(e.target)) return

    const key = normalizeKey(e)
    const state = focusService.getState()
    const hasAriaModal = document.querySelector('[role="dialog"][aria-modal="true"]') !== null

    // 1. Modal-local bindings
    if (modalScope) {
      const action = actionRegistry.resolve(key, modalScope)
      if (action) {
        e.preventDefault()
        action.execute({ selectedItem: undefined, focusedSection: modalScope })
      }
      // When a modal scope is active, do not dispatch global navigation/actions.
      return
    }

    // If a modal is open but not explicitly scoped yet, only allow vertical list navigation.
    if (hasAriaModal && e.key !== "ArrowDown" && e.key !== "ArrowUp") {
      return
    }

    // 2. Tab navigation
    if (e.key === "Tab") {
      e.preventDefault()
      if (e.shiftKey) {
        focusService.focusPrevSection()
      } else {
        focusService.focusNextSection()
      }
      return
    }

    // 3. Arrow navigation
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault()
      focusService.moveItem(1)
      return
    }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault()
      focusService.moveItem(-1)
      return
    }

    // 4. Focused-section action bindings
    if (state.activeSection) {
      const scopes = [state.activeSection, `${state.activeSection}.focused`]
      for (const scope of scopes) {
        const action = actionRegistry.resolve(key, scope)
        if (action) {
          e.preventDefault()
          action.execute({
            selectedItem: String(state.activeIndex),
            focusedSection: state.activeSection,
          })
          return
        }
      }
    }

    // 5. Global bindings
    const globalAction = actionRegistry.resolve(key, "global")
    if (globalAction) {
      e.preventDefault()
      globalAction.execute({
        selectedItem: undefined,
        focusedSection: state.activeSection,
      })
    }
  }

  function attach() {
    if (attached) return
    document.addEventListener("keydown", handleKeyDown)
    attached = true
  }

  function detach() {
    document.removeEventListener("keydown", handleKeyDown)
    attached = false
  }

  function setModalScope(scope: string | null) {
    modalScope = scope
  }

  return { attach, detach, setModalScope }
}

export type KeyboardService = ReturnType<typeof createKeyboardService>
