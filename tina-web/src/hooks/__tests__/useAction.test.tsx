import { describe, it, expect, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { RuntimeProvider, useServices } from "@/providers/RuntimeProvider"
import { useAction } from "../useAction"
import type { ReactNode } from "react"

function wrapper({ children }: { children: ReactNode }) {
  return <RuntimeProvider>{children}</RuntimeProvider>
}

describe("useAction", () => {
  it("returns descriptor for registered action", () => {
    const { result } = renderHook(
      () => {
        const services = useServices()
        const mockExecute = vi.fn()

        services.actionRegistry.register({
          id: "test-action",
          label: "Test Action",
          execute: mockExecute,
        })

        const action = useAction("test-action")
        return { action, mockExecute }
      },
      { wrapper }
    )

    expect(result.current.action.descriptor).toEqual({
      id: "test-action",
      label: "Test Action",
      execute: result.current.mockExecute,
    })
  })

  it("returns undefined descriptor for non-existent action", () => {
    const { result } = renderHook(() => useAction("non-existent"), { wrapper })

    expect(result.current.descriptor).toBeUndefined()
  })

  it("execute callback calls action with context", () => {
    const { result } = renderHook(
      () => {
        const services = useServices()
        const mockExecute = vi.fn()

        services.actionRegistry.register({
          id: "test-action",
          label: "Test Action",
          execute: mockExecute,
        })

        const action = useAction("test-action")
        return { action, mockExecute }
      },
      { wrapper }
    )

    const testContext = { selectedItem: "item-1" }
    result.current.action.execute(testContext)

    expect(result.current.mockExecute).toHaveBeenCalledWith(testContext)
  })

  it("execute handles action not found", () => {
    const { result } = renderHook(() => useAction("non-existent"), { wrapper })

    // Should not throw when executing non-existent action
    expect(() => result.current.execute()).not.toThrow()
  })

  it("execute callback is stable when action doesn't change", () => {
    const { result, rerender } = renderHook(
      () => {
        const services = useServices()
        const mockExecute = vi.fn()

        services.actionRegistry.register({
          id: "test-action",
          label: "Test Action",
          execute: mockExecute,
        })

        const action = useAction("test-action")
        return action
      },
      { wrapper }
    )

    const firstExecute = result.current.execute
    rerender()
    const secondExecute = result.current.execute

    expect(firstExecute).toBe(secondExecute)
  })
})
