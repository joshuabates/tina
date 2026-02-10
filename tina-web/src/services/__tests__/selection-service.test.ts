import { describe, it, expect, vi } from 'vitest'
import { createSelectionService } from '../selection-service'

describe('SelectionService', () => {
  it('should initialize with null state', () => {
    const service = createSelectionService()
    const state = service.getState()

    expect(state.orchestrationId).toBeNull()
    expect(state.phaseId).toBeNull()
  })

  it('should select orchestration and clear phase', () => {
    const service = createSelectionService()

    service.selectPhase('phase-1')
    expect(service.getState().phaseId).toBe('phase-1')

    service.selectOrchestration('orch-1')

    expect(service.getState().orchestrationId).toBe('orch-1')
    expect(service.getState().phaseId).toBeNull()
  })

  it('should select phase and preserve orchestration', () => {
    const service = createSelectionService()

    service.selectOrchestration('orch-1')
    service.selectPhase('phase-1')

    expect(service.getState().orchestrationId).toBe('orch-1')
    expect(service.getState().phaseId).toBe('phase-1')
  })

  it('should sync from URL search params', () => {
    const service = createSelectionService()
    const params = new URLSearchParams('orch=orch-123&phase=phase-456')

    service.syncFromUrl(params)

    expect(service.getState().orchestrationId).toBe('orch-123')
    expect(service.getState().phaseId).toBe('phase-456')
  })

  it('should sync from URL with only orchestration', () => {
    const service = createSelectionService()
    const params = new URLSearchParams('orch=orch-123')

    service.syncFromUrl(params)

    expect(service.getState().orchestrationId).toBe('orch-123')
    expect(service.getState().phaseId).toBeNull()
  })

  it('should serialize state to URL params', () => {
    const service = createSelectionService()

    service.selectOrchestration('orch-1')
    service.selectPhase('phase-1')

    const params = service.toUrlParams()

    expect(params.get('orch')).toBe('orch-1')
    expect(params.get('phase')).toBe('phase-1')
  })

  it('should serialize state with only orchestration to URL params', () => {
    const service = createSelectionService()

    service.selectOrchestration('orch-1')

    const params = service.toUrlParams()

    expect(params.get('orch')).toBe('orch-1')
    expect(params.has('phase')).toBe(false)
  })

  it('should call listeners on state change', () => {
    const service = createSelectionService()
    const listener = vi.fn()

    service.subscribe(listener)
    service.selectOrchestration('orch-1')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({
      orchestrationId: 'orch-1',
      phaseId: null
    })
  })

  it('should not notify on redundant set - same orchestration', () => {
    const service = createSelectionService()
    const listener = vi.fn()

    service.selectOrchestration('orch-1')
    service.subscribe(listener)
    service.selectOrchestration('orch-1')

    expect(listener).not.toHaveBeenCalled()
  })

  it('should not notify on redundant set - same phase', () => {
    const service = createSelectionService()
    const listener = vi.fn()

    service.selectOrchestration('orch-1')
    service.selectPhase('phase-1')
    service.subscribe(listener)
    service.selectPhase('phase-1')

    expect(listener).not.toHaveBeenCalled()
  })

  it('should not notify on redundant set - null orchestration', () => {
    const service = createSelectionService()
    const listener = vi.fn()

    // Initial state is already null, subscribe, then try to set null again
    service.subscribe(listener)
    service.selectOrchestration(null)

    expect(listener).not.toHaveBeenCalled()
  })

  it('should support multiple listeners', () => {
    const service = createSelectionService()
    const listener1 = vi.fn()
    const listener2 = vi.fn()

    service.subscribe(listener1)
    service.subscribe(listener2)
    service.selectOrchestration('orch-1')

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)
  })

  it('should allow unsubscribe', () => {
    const service = createSelectionService()
    const listener = vi.fn()

    const unsubscribe = service.subscribe(listener)
    service.selectOrchestration('orch-1')

    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    service.selectOrchestration('orch-2')

    expect(listener).toHaveBeenCalledTimes(1) // Not called again
  })

  it('should handle clearing orchestration', () => {
    const service = createSelectionService()

    service.selectOrchestration('orch-1')
    service.selectOrchestration(null)

    expect(service.getState().orchestrationId).toBeNull()
    expect(service.getState().phaseId).toBeNull()
  })

  it('should handle clearing phase', () => {
    const service = createSelectionService()

    service.selectOrchestration('orch-1')
    service.selectPhase('phase-1')
    service.selectPhase(null)

    expect(service.getState().orchestrationId).toBe('orch-1')
    expect(service.getState().phaseId).toBeNull()
  })
})
