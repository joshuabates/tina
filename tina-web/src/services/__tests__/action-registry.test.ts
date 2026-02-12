import { describe, it, expect } from 'vitest'
import { createActionRegistry } from '../action-registry'
import type { ActionDescriptor } from '../action-registry'

describe('ActionRegistry', () => {
  it('registers an action and retrieves it by ID', () => {
    const registry = createActionRegistry()
    const action: ActionDescriptor = {
      id: 'test.action',
      label: 'Test Action',
      execute: () => {},
    }

    const cleanup = registry.register(action)
    const retrieved = registry.get('test.action')

    expect(retrieved).toBe(action)
    expect(cleanup).toBeTypeOf('function')
  })

  it('resolves a keybinding to the correct action', () => {
    const registry = createActionRegistry()
    const action: ActionDescriptor = {
      id: 'test.action',
      label: 'Test Action',
      key: 'Space',
      when: 'sidebar.focused',
      execute: () => {},
    }

    registry.register(action)
    const resolved = registry.resolve('Space', 'sidebar.focused')

    expect(resolved).toBe(action)
  })

  it('treats undefined and "global" scopes as equivalent for keybindings', () => {
    const registry = createActionRegistry()
    const action: ActionDescriptor = {
      id: 'test.global',
      label: 'Global Action',
      key: 'Space',
      execute: () => {},
    }

    registry.register(action)

    expect(registry.resolve('Space', 'global')).toBe(action)
    expect(registry.resolve('Space')).toBe(action)
  })

  it('normalizes space aliases for keybinding resolution', () => {
    const registry = createActionRegistry()
    const action: ActionDescriptor = {
      id: 'test.space-alias',
      label: 'Space Alias Action',
      key: ' ',
      when: 'sidebar.focused',
      execute: () => {},
    }

    registry.register(action)

    expect(registry.resolve('Space', 'sidebar.focused')).toBe(action)
    expect(registry.resolve(' ', 'sidebar.focused')).toBe(action)
    expect(registry.resolve('Spacebar', 'sidebar.focused')).toBe(action)
  })

  it('throws error on duplicate (scope, key) registration', () => {
    const registry = createActionRegistry()
    const action1: ActionDescriptor = {
      id: 'test.action1',
      label: 'Test Action 1',
      key: 'Space',
      when: 'sidebar.focused',
      execute: () => {},
    }
    const action2: ActionDescriptor = {
      id: 'test.action2',
      label: 'Test Action 2',
      key: 'Space',
      when: 'sidebar.focused',
      execute: () => {},
    }

    registry.register(action1)
    expect(() => registry.register(action2)).toThrow(/Keybinding.*is already registered/)
  })

  it('allows same ID re-registration (StrictMode idempotent)', () => {
    const registry = createActionRegistry()
    const action: ActionDescriptor = {
      id: 'test.action',
      label: 'Test Action',
      execute: () => {},
    }

    registry.register(action)
    // Should not throw in StrictMode
    expect(() => registry.register(action)).not.toThrow()
  })

  it('cleanup function removes action and binding', () => {
    const registry = createActionRegistry()
    const action: ActionDescriptor = {
      id: 'test.action',
      label: 'Test Action',
      key: 'Space',
      when: 'sidebar.focused',
      execute: () => {},
    }

    const cleanup = registry.register(action)
    cleanup()

    expect(registry.get('test.action')).toBeUndefined()
    expect(registry.resolve('Space', 'sidebar.focused')).toBeUndefined()
  })

  it('listForScope returns only matching actions', () => {
    const registry = createActionRegistry()
    const action1: ActionDescriptor = {
      id: 'test.action1',
      label: 'Test Action 1',
      when: 'sidebar.focused',
      execute: () => {},
    }
    const action2: ActionDescriptor = {
      id: 'test.action2',
      label: 'Test Action 2',
      when: 'main.focused',
      execute: () => {},
    }
    const action3: ActionDescriptor = {
      id: 'test.action3',
      label: 'Test Action 3',
      when: 'sidebar.focused',
      execute: () => {},
    }

    registry.register(action1)
    registry.register(action2)
    registry.register(action3)

    const sidebarActions = registry.listForScope('sidebar.focused')
    expect(sidebarActions).toHaveLength(2)
    expect(sidebarActions).toContain(action1)
    expect(sidebarActions).toContain(action3)
    expect(sidebarActions).not.toContain(action2)
  })

  it('listAll returns all actions', () => {
    const registry = createActionRegistry()
    const action1: ActionDescriptor = {
      id: 'test.action1',
      label: 'Test Action 1',
      execute: () => {},
    }
    const action2: ActionDescriptor = {
      id: 'test.action2',
      label: 'Test Action 2',
      execute: () => {},
    }

    registry.register(action1)
    registry.register(action2)

    const allActions = registry.listAll()
    expect(allActions).toHaveLength(2)
    expect(allActions).toContain(action1)
    expect(allActions).toContain(action2)
  })
})
