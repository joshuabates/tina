import { describe, it, expect, vi } from 'vitest'
import { createFocusService } from '../focus-service'

describe('FocusService', () => {
  it('registers a section and it becomes active by default', () => {
    const service = createFocusService()
    const cleanup = service.registerSection('sidebar', 5)

    const state = service.getState()
    expect(state.activeSection).toBe('sidebar')
    expect(state.activeIndex).toBe(0)
    expect(cleanup).toBeTypeOf('function')
  })

  it('registers multiple sections and tab cycles between them', () => {
    const service = createFocusService()
    service.registerSection('sidebar', 3)
    service.registerSection('main', 5)
    service.registerSection('footer', 2)

    const state1 = service.getState()
    expect(state1.activeSection).toBe('sidebar')

    service.focusNextSection()
    const state2 = service.getState()
    expect(state2.activeSection).toBe('main')

    service.focusNextSection()
    const state3 = service.getState()
    expect(state3.activeSection).toBe('footer')

    service.focusNextSection()
    const state4 = service.getState()
    expect(state4.activeSection).toBe('sidebar')

    service.focusPrevSection()
    const state5 = service.getState()
    expect(state5.activeSection).toBe('footer')
  })

  it('clamps arrow movement to item bounds', () => {
    const service = createFocusService()
    service.registerSection('sidebar', 3)

    expect(service.getState().activeIndex).toBe(0)

    service.moveItem(1)
    expect(service.getState().activeIndex).toBe(1)

    service.moveItem(1)
    expect(service.getState().activeIndex).toBe(2)

    service.moveItem(1)
    expect(service.getState().activeIndex).toBe(2)

    service.moveItem(-1)
    expect(service.getState().activeIndex).toBe(1)

    service.moveItem(-1)
    expect(service.getState().activeIndex).toBe(0)

    service.moveItem(-1)
    expect(service.getState().activeIndex).toBe(0)
  })

  it('unregisters section and moves focus to next section', () => {
    const service = createFocusService()
    const cleanup1 = service.registerSection('sidebar', 3)
    const cleanup2 = service.registerSection('main', 5)

    expect(service.getState().activeSection).toBe('sidebar')

    cleanup1()
    expect(service.getState().activeSection).toBe('main')
    expect(service.getState().activeIndex).toBe(0)

    cleanup2()
    expect(service.getState().activeSection).toBeUndefined()
  })

  it('clamps active index when item count is reduced', () => {
    const service = createFocusService()
    service.registerSection('sidebar', 5)

    service.moveItem(1)
    service.moveItem(1)
    service.moveItem(1)
    expect(service.getState().activeIndex).toBe(3)

    service.setItemCount('sidebar', 2)
    expect(service.getState().activeIndex).toBe(1)
  })

  it('getState returns correct snapshot', () => {
    const service = createFocusService()
    service.registerSection('sidebar', 3)
    service.registerSection('main', 5)
    service.moveItem(1)

    const state = service.getState()
    expect(state).toEqual({
      activeSection: 'sidebar',
      activeIndex: 1,
      sections: {
        sidebar: { itemCount: 3 },
        main: { itemCount: 5 },
      },
    })
  })

  it('notifies subscribers when state changes', () => {
    const service = createFocusService()
    const listener = vi.fn()

    service.subscribe(listener)
    service.registerSection('sidebar', 3)

    expect(listener).toHaveBeenCalledWith({
      activeSection: 'sidebar',
      activeIndex: 0,
      sections: { sidebar: { itemCount: 3 } },
    })

    service.moveItem(1)
    expect(listener).toHaveBeenCalledWith({
      activeSection: 'sidebar',
      activeIndex: 1,
      sections: { sidebar: { itemCount: 3 } },
    })
  })
})
