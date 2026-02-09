import { useCallback, useEffect, useSyncExternalStore, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useServices } from "@/providers/RuntimeProvider"

export function useSelection() {
  const { selectionService } = useServices()
  const [searchParams, setSearchParams] = useSearchParams()
  const isSyncingRef = useRef(false)

  // Sync from URL to service
  useEffect(() => {
    if (isSyncingRef.current) return
    isSyncingRef.current = true
    selectionService.syncFromUrl(searchParams)
    isSyncingRef.current = false
  }, [selectionService, searchParams])

  // Sync from service to URL
  useEffect(() => {
    return selectionService.subscribe(() => {
      if (isSyncingRef.current) return
      isSyncingRef.current = true
      const params = selectionService.toUrlParams()
      setSearchParams(params, { replace: true })
      isSyncingRef.current = false
    })
  }, [selectionService, setSearchParams])

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
