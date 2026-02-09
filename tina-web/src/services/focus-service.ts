export interface FocusState {
  activeSection: string | undefined
  activeIndex: number
  sections: Record<string, { itemCount: number }>
}

type Listener = (state: FocusState) => void

export function createFocusService() {
  const sections = new Map<string, { itemCount: number }>()
  const sectionOrder: string[] = []
  let activeSection: string | undefined
  let activeIndex = 0
  const listeners = new Set<Listener>()

  function notify() {
    const state = getState()
    listeners.forEach((listener) => listener(state))
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function registerSection(id: string, itemCount: number): () => void {
    if (!sections.has(id)) {
      sections.set(id, { itemCount })
      sectionOrder.push(id)

      if (activeSection === undefined) {
        activeSection = id
        activeIndex = 0
      }

      notify()
    }

    return () => {
      sections.delete(id)
      const orderIndex = sectionOrder.indexOf(id)
      if (orderIndex !== -1) {
        sectionOrder.splice(orderIndex, 1)
      }

      if (activeSection === id) {
        if (sectionOrder.length > 0) {
          const nextIndex = orderIndex < sectionOrder.length ? orderIndex : 0
          activeSection = sectionOrder[nextIndex]
          activeIndex = 0
        } else {
          activeSection = undefined
          activeIndex = 0
        }
      }

      notify()
    }
  }

  function setItemCount(sectionId: string, count: number) {
    const section = sections.get(sectionId)
    if (section) {
      section.itemCount = count
      if (activeSection === sectionId && activeIndex >= count) {
        activeIndex = Math.max(0, count - 1)
      }
      notify()
    }
  }

  function focusSection(sectionId: string) {
    if (sections.has(sectionId)) {
      activeSection = sectionId
      activeIndex = 0
      notify()
    }
  }

  function focusNextSection() {
    if (sectionOrder.length === 0) return

    const currentIndex = activeSection
      ? sectionOrder.indexOf(activeSection)
      : -1
    const nextIndex = (currentIndex + 1) % sectionOrder.length
    activeSection = sectionOrder[nextIndex]
    activeIndex = 0
    notify()
  }

  function focusPrevSection() {
    if (sectionOrder.length === 0) return

    const currentIndex = activeSection
      ? sectionOrder.indexOf(activeSection)
      : 0
    const prevIndex =
      currentIndex === 0 ? sectionOrder.length - 1 : currentIndex - 1
    activeSection = sectionOrder[prevIndex]
    activeIndex = 0
    notify()
  }

  function moveItem(delta: number) {
    if (!activeSection) return

    const section = sections.get(activeSection)
    if (!section) return

    const newIndex = activeIndex + delta
    activeIndex = Math.max(0, Math.min(section.itemCount - 1, newIndex))
    notify()
  }

  function getState(): FocusState {
    return {
      activeSection,
      activeIndex,
      sections: Object.fromEntries(sections),
    }
  }

  return {
    subscribe,
    registerSection,
    setItemCount,
    focusSection,
    focusNextSection,
    focusPrevSection,
    moveItem,
    getState,
  }
}

export type FocusService = ReturnType<typeof createFocusService>
