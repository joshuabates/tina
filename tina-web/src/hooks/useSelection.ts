import { useCallback, useEffect, useSyncExternalStore, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useServices } from "@/providers/RuntimeProvider"
import type { SelectionService } from "@/services/selection-service"

interface SelectionSyncBridge {
  owner: symbol | null
  isSyncing: boolean
}

const selectionSyncBridges = new WeakMap<SelectionService, SelectionSyncBridge>()

function getSelectionSyncBridge(
  selectionService: SelectionService,
): SelectionSyncBridge {
  const existing = selectionSyncBridges.get(selectionService)
  if (existing) return existing

  const created: SelectionSyncBridge = {
    owner: null,
    isSyncing: false,
  }
  selectionSyncBridges.set(selectionService, created)
  return created
}

export function useSelection() {
  const { selectionService } = useServices()
  const [searchParams, setSearchParams] = useSearchParams()
  const ownerRef = useRef(Symbol("selection-sync-owner"))
  const syncBridge = getSelectionSyncBridge(selectionService)
  if (syncBridge.owner === null) {
    syncBridge.owner = ownerRef.current
  }
  const isSyncOwner = syncBridge.owner === ownerRef.current

  useEffect(() => {
    if (syncBridge.owner === null) {
      syncBridge.owner = ownerRef.current
    }

    return () => {
      if (syncBridge.owner === ownerRef.current) {
        syncBridge.owner = null
        syncBridge.isSyncing = false
      }
    }
  }, [syncBridge])

  // Sync from URL to service (single owner hook)
  useEffect(() => {
    if (!isSyncOwner) return
    if (syncBridge.isSyncing) {
      syncBridge.isSyncing = false
      return
    }
    syncBridge.isSyncing = true
    selectionService.syncFromUrl(searchParams)
    syncBridge.isSyncing = false
  }, [isSyncOwner, selectionService, searchParams, syncBridge])

  // Sync from service to URL (single owner hook)
  useEffect(() => {
    if (!isSyncOwner) return

    return selectionService.subscribe(() => {
      if (syncBridge.isSyncing) return
      syncBridge.isSyncing = true
      const params = selectionService.toUrlParams()
      setSearchParams(params, { replace: true })
    })
  }, [isSyncOwner, selectionService, setSearchParams, syncBridge])

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
