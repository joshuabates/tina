export interface SelectionState {
  orchestrationId: string | null
  phaseId: string | null
}

type Listener = (state: SelectionState) => void

export function createSelectionService() {
  let state: SelectionState = {
    orchestrationId: null,
    phaseId: null
  }

  const listeners = new Set<Listener>()

  function notifyListeners() {
    listeners.forEach(listener => listener({ ...state }))
  }

  function selectOrchestration(orchestrationId: string | null) {
    if (state.orchestrationId === orchestrationId && orchestrationId !== null) {
      return // No change, don't notify
    }

    state = {
      orchestrationId,
      phaseId: null // Clear phase when selecting orchestration
    }
    notifyListeners()
  }

  function selectPhase(phaseId: string | null) {
    if (state.phaseId === phaseId) {
      return // No change, don't notify
    }

    state = {
      ...state,
      phaseId
    }
    notifyListeners()
  }

  function syncFromUrl(params: URLSearchParams) {
    const orchestrationId = params.get('orch')
    const phaseId = params.get('phase')

    const newState: SelectionState = {
      orchestrationId,
      phaseId
    }

    // Check if state actually changed
    if (
      state.orchestrationId === newState.orchestrationId &&
      state.phaseId === newState.phaseId
    ) {
      return // No change, don't notify
    }

    state = newState
    notifyListeners()
  }

  function toUrlParams(): URLSearchParams {
    const params = new URLSearchParams()

    if (state.orchestrationId) {
      params.set('orch', state.orchestrationId)
    }

    if (state.phaseId) {
      params.set('phase', state.phaseId)
    }

    return params
  }

  function getState(): SelectionState {
    return { ...state }
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    subscribe,
    selectOrchestration,
    selectPhase,
    syncFromUrl,
    toUrlParams,
    getState
  }
}

export type SelectionService = ReturnType<typeof createSelectionService>
