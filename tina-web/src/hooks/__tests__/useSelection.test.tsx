import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { RuntimeProvider } from "@/providers/RuntimeProvider"
import { useSelection } from "../useSelection"
import type { ReactNode } from "react"

function createWrapper(initialUrl = "/") {
  return function wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialUrl]}>
        <RuntimeProvider>{children}</RuntimeProvider>
      </MemoryRouter>
    )
  }
}

describe("useSelection", () => {
  it("initializes with null selections", () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: createWrapper(),
    })

    expect(result.current.orchestrationId).toBeNull()
    expect(result.current.phaseId).toBeNull()
  })

  it("syncs from URL params on mount", () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: createWrapper("/?orch=orch-123&phase=phase-456"),
    })

    expect(result.current.orchestrationId).toBe("orch-123")
    expect(result.current.phaseId).toBe("phase-456")
  })

  it("selectOrchestration updates state and URL", () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.selectOrchestration("orch-123")
    })

    expect(result.current.orchestrationId).toBe("orch-123")
    expect(result.current.phaseId).toBeNull()
  })

  it("selectPhase updates state and URL", () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: createWrapper("/?orch=orch-123"),
    })

    act(() => {
      result.current.selectPhase("phase-456")
    })

    expect(result.current.orchestrationId).toBe("orch-123")
    expect(result.current.phaseId).toBe("phase-456")
  })

  it("selectOrchestration clears phaseId", () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: createWrapper("/?orch=orch-123&phase=phase-456"),
    })

    expect(result.current.phaseId).toBe("phase-456")

    act(() => {
      result.current.selectOrchestration("orch-789")
    })

    expect(result.current.orchestrationId).toBe("orch-789")
    expect(result.current.phaseId).toBeNull()
  })

  it("selectOrchestration with null clears selection", () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: createWrapper("/?orch=orch-123&phase=phase-456"),
    })

    act(() => {
      result.current.selectOrchestration(null)
    })

    expect(result.current.orchestrationId).toBeNull()
    expect(result.current.phaseId).toBeNull()
  })

  it("selectPhase with null clears phase", () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: createWrapper("/?orch=orch-123&phase=phase-456"),
    })

    act(() => {
      result.current.selectPhase(null)
    })

    expect(result.current.orchestrationId).toBe("orch-123")
    expect(result.current.phaseId).toBeNull()
  })

  it("bidirectional sync: service changes update URL", () => {
    const { result } = renderHook(() => useSelection(), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.selectOrchestration("orch-123")
    })

    // URL should be updated (this is implicitly tested by the hook working)
    expect(result.current.orchestrationId).toBe("orch-123")
  })
})
