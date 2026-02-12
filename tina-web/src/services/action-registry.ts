export interface ActionDescriptor {
  id: string
  label: string
  key?: string // keybinding (e.g., "Space", "Enter", "Alt+r")
  when?: string // focus context (e.g., "sidebar.focused")
  icon?: string // lucide icon name
  execute: (ctx: ActionContext) => void
}

export interface ActionContext {
  selectedItem?: string
  focusedSection?: string
  [key: string]: unknown
}

type KeyBindingKey = `${string}::${string}` // "scope::key" format

export function createActionRegistry() {
  const actions = new Map<string, ActionDescriptor>()
  const keyBindings = new Map<KeyBindingKey, ActionDescriptor>()

  function normalizeScope(scope: string | undefined): string | undefined {
    return scope === "global" ? undefined : scope
  }

  function normalizeKey(key: string): string {
    if (key === " " || key === "Spacebar") {
      return "Space"
    }
    return key
  }

  function makeKeyBindingKey(
    key: string,
    scope: string | undefined
  ): KeyBindingKey {
    return `${normalizeScope(scope) ?? ''}::${normalizeKey(key)}`
  }

  function register(action: ActionDescriptor): () => void {
    // Idempotent registration for StrictMode
    if (actions.has(action.id) && actions.get(action.id) === action) {
      return () => {
        actions.delete(action.id)
        if (action.key) {
          const bindingKey = makeKeyBindingKey(action.key, action.when)
          keyBindings.delete(bindingKey)
        }
      }
    }

    // Check for duplicate keybinding
    if (action.key) {
      const bindingKey = makeKeyBindingKey(action.key, action.when)
      if (keyBindings.has(bindingKey)) {
        throw new Error(
          `Keybinding "${action.key}" for scope "${action.when ?? 'global'}" is already registered`
        )
      }
      keyBindings.set(bindingKey, action)
    }

    actions.set(action.id, action)

    return () => {
      actions.delete(action.id)
      if (action.key) {
        const bindingKey = makeKeyBindingKey(action.key, action.when)
        keyBindings.delete(bindingKey)
      }
    }
  }

  function get(id: string): ActionDescriptor | undefined {
    return actions.get(id)
  }

  function resolve(
    key: string,
    scope?: string
  ): ActionDescriptor | undefined {
    const bindingKey = makeKeyBindingKey(key, scope)
    return keyBindings.get(bindingKey)
  }

  function listForScope(scope: string): ActionDescriptor[] {
    const normalizedScope = normalizeScope(scope)
    return Array.from(actions.values()).filter(
      (action) => normalizeScope(action.when) === normalizedScope
    )
  }

  function listAll(): ActionDescriptor[] {
    return Array.from(actions.values())
  }

  return {
    register,
    get,
    resolve,
    listForScope,
    listAll,
  }
}

export type ActionRegistry = ReturnType<typeof createActionRegistry>
