import { useEffect, useSyncExternalStore } from "react"
import { useServices } from "@/providers/RuntimeProvider"

export function useFocusable(sectionId: string, itemCount: number) {
  const { focusService } = useServices()

  useEffect(() => {
    const cleanup = focusService.registerSection(sectionId, itemCount)
    return cleanup
  }, [focusService, sectionId, itemCount])

  useEffect(() => {
    focusService.setItemCount(sectionId, itemCount)
  }, [focusService, sectionId, itemCount])

  const state = useSyncExternalStore(
    focusService.subscribe,
    focusService.getState
  )

  return {
    isSectionFocused: state.activeSection === sectionId,
    activeIndex: state.activeSection === sectionId ? state.activeIndex : -1,
  }
}
