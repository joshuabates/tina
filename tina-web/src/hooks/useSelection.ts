import { useCallback, useEffect, useSyncExternalStore } from "react"
import { useSearchParams } from "react-router-dom"
import { useServices } from "@/providers/RuntimeProvider"
import type { SelectionService } from "@/services/selection-service"

interface SelectionUrlSyncState {
  pendingUrl: string | null
  lastSeenUrl: string
}

const selectionUrlSyncStates = new WeakMap<SelectionService, SelectionUrlSyncState>()

function getSelectionUrlSyncState(
  selectionService: SelectionService,
  initialUrl: string,
): SelectionUrlSyncState {
  const existing = selectionUrlSyncStates.get(selectionService)
  if (existing) {
    return existing
  }

  const created: SelectionUrlSyncState = {
    pendingUrl: null,
    lastSeenUrl: initialUrl,
  }
  selectionUrlSyncStates.set(selectionService, created)
  return created
}

export function useSelection() {
  const { selectionService } = useServices()
  const [searchParams, setSearchParams] = useSearchParams()
  const syncState = getSelectionUrlSyncState(
    selectionService,
    searchParams.toString(),
  )

  // Keep service state in sync with URL query params.
  useEffect(() => {
    const currentQuery = searchParams.toString()
    const pendingQuery = syncState.pendingUrl

    if (pendingQuery !== null) {
      if (currentQuery === pendingQuery) {
        syncState.pendingUrl = null
        syncState.lastSeenUrl = currentQuery
        return
      }

      // Ignore stale URL snapshots while a local URL update is in flight.
      if (currentQuery === syncState.lastSeenUrl) {
        return
      }

      // External navigation won the race. Adopt URL and clear pending write.
      syncState.pendingUrl = null
    }

    syncState.lastSeenUrl = currentQuery
    selectionService.syncFromUrl(searchParams)
  }, [searchParams, selectionService, syncState])

  // Keep URL query params in sync with service state.
  useEffect(() => {
    return selectionService.subscribe(() => {
      const params = selectionService.toUrlParams()
      const nextQuery = params.toString()
      if (
        nextQuery === syncState.lastSeenUrl ||
        nextQuery === syncState.pendingUrl
      ) {
        return
      }

      syncState.pendingUrl = nextQuery
      setSearchParams(params, { replace: true })
    })
  }, [selectionService, setSearchParams, syncState])

  const state = useSyncExternalStore(
    selectionService.subscribe,
    selectionService.getState
  )

  const selectOrchestration = useCallback(
    (id: string | null) => selectionService.selectOrchestration(id),
    [selectionService]
  )

  const selectPhase = useCallback(
    (id: string | null) => selectionService.selectPhase(id),
    [selectionService]
  )

  return { ...state, selectOrchestration, selectPhase }
}
