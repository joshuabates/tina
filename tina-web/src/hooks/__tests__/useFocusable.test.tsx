import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { RuntimeProvider, useServices } from "@/providers/RuntimeProvider"
import { useFocusable } from "../useFocusable"
import type { ReactNode } from "react"

function wrapper({ children }: { children: ReactNode }) {
  return <RuntimeProvider>{children}</RuntimeProvider>
}

describe("useFocusable", () => {
  it("registers section on mount", () => {
    const { result } = renderHook(
      () => {
        const services = useServices()
        useFocusable("test-section", 5)
        return services
      },
      { wrapper }
    )

    const state = result.current.focusService.getState()
    expect(state.sections["test-section"]).toEqual({ itemCount: 5 })
  })

  it("unregisters section on unmount", () => {
    let focusService: ReturnType<typeof useServices>["focusService"]

    const { unmount } = renderHook(
      () => {
        const services = useServices()
        focusService = services.focusService
        useFocusable("test-section", 5)
      },
      { wrapper }
    )

    unmount()

    const state = focusService!.getState()
    expect(state.sections["test-section"]).toBeUndefined()
  })

  it("returns isSectionFocused true for active section", () => {
    const { result } = renderHook(() => useFocusable("test-section", 5), {
      wrapper,
    })

    expect(result.current.isSectionFocused).toBe(true)
    expect(result.current.activeIndex).toBe(0)
  })

  it("returns isSectionFocused false for inactive section", () => {
    const { result } = renderHook(
      () => {
        const services = useServices()
        useFocusable("section-1", 3)
        const section2 = useFocusable("section-2", 5)
        return { services, section2 }
      },
      { wrapper }
    )

    expect(result.current.section2.isSectionFocused).toBe(false)
    expect(result.current.section2.activeIndex).toBe(-1)

    // Activate section-2
    act(() => {
      result.current.services.focusService.focusSection("section-2")
    })

    expect(result.current.section2.isSectionFocused).toBe(true)
    expect(result.current.section2.activeIndex).toBe(0)
  })

  it("tracks active index when section is focused", () => {
    const { result } = renderHook(
      () => {
        const services = useServices()
        const focusable = useFocusable("test-section", 5)
        return { services, focusable }
      },
      { wrapper }
    )

    expect(result.current.focusable.activeIndex).toBe(0)

    act(() => {
      result.current.services.focusService.moveItem(2)
    })

    expect(result.current.focusable.activeIndex).toBe(2)
  })

  it("updates item count when prop changes", () => {
    const { result, rerender } = renderHook(
      ({ count }) => {
        const services = useServices()
        useFocusable("test-section", count)
        return services
      },
      {
        wrapper,
        initialProps: { count: 5 },
      }
    )

    let state = result.current.focusService.getState()
    expect(state.sections["test-section"]).toEqual({ itemCount: 5 })

    rerender({ count: 10 })

    state = result.current.focusService.getState()
    expect(state.sections["test-section"]).toEqual({ itemCount: 10 })
  })

  it("reacts to focus changes from service", () => {
    const { result } = renderHook(
      () => {
        const services = useServices()
        useFocusable("section-1", 3)
        const section2 = useFocusable("section-2", 5)
        return { services, section2 }
      },
      { wrapper }
    )

    expect(result.current.section2.isSectionFocused).toBe(false)

    act(() => {
      result.current.services.focusService.focusNextSection()
    })

    expect(result.current.section2.isSectionFocused).toBe(true)
  })
})
