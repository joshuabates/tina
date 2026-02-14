import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { Terminal } from "xterm"
import { useTerminal } from "../useTerminal"

vi.mock("xterm", () => ({
  Terminal: vi.fn().mockImplementation(function () {
    return {
      loadAddon: vi.fn(),
      open: vi.fn(),
      dispose: vi.fn(),
      focus: vi.fn(),
    }
  }),
}))

vi.mock("@xterm/addon-attach", () => ({
  AttachAddon: vi.fn(),
}))

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(function () {
    return {
      fit: vi.fn(),
      proposeDimensions: vi.fn().mockReturnValue({ cols: 80, rows: 24 }),
    }
  }),
}))

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: vi.fn(),
}))

type WsListener = (...args: unknown[]) => void

class MockWebSocket {
  binaryType = ""
  readyState = 0
  close = vi.fn()
  send = vi.fn()
  private listeners: Record<string, WsListener[]> = {}

  addEventListener(event: string, handler: WsListener) {
    this.listeners[event] ??= []
    this.listeners[event].push(handler)
  }

  simulateOpen() {
    this.readyState = 1
    this.listeners.open?.forEach((h) => h())
  }

  simulateClose() {
    this.readyState = 3
    this.listeners.close?.forEach((h) => h())
  }
}

let capturedWs: MockWebSocket | null = null
const OriginalWebSocket = globalThis.WebSocket
const OriginalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  capturedWs = null
  globalThis.WebSocket = vi.fn().mockImplementation(function () {
    capturedWs = new MockWebSocket()
    return capturedWs
  }) as unknown as typeof WebSocket
  Object.assign(globalThis.WebSocket, {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  })

  globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }
  }) as unknown as typeof ResizeObserver

  vi.mocked(Terminal).mockClear()
})

afterEach(() => {
  globalThis.WebSocket = OriginalWebSocket
  globalThis.ResizeObserver = OriginalResizeObserver
  document.body.innerHTML = ""
})

/** Render the hook with a container attached, optionally triggering connection. */
function renderConnected(paneId: string | null, onStatusChange = vi.fn()) {
  const container = document.createElement("div")
  document.body.appendChild(container)

  const { result, rerender, unmount } = renderHook(
    (props: { paneId: string | null }) =>
      useTerminal({ paneId: props.paneId, onStatusChange }),
    { initialProps: { paneId: null as string | null } },
  )

  // Attach the ref to a real DOM element between renders
  Object.assign(result.current.containerRef, { current: container })

  if (paneId !== null) {
    rerender({ paneId })
  }

  return { result, rerender, unmount, onStatusChange, container }
}

describe("useTerminal", () => {
  it("returns containerRef that can be attached to a DOM element", () => {
    const { result } = renderHook(() =>
      useTerminal({ paneId: null, onStatusChange: undefined }),
    )

    expect(result.current.containerRef).toBeDefined()
    expect(result.current.containerRef.current).toBeNull()
  })

  it("sets status to 'connecting' when paneId is provided", () => {
    const { onStatusChange } = renderConnected("test-pane")

    expect(onStatusChange).toHaveBeenCalledWith("connecting")
  })

  it("sets status to 'connected' on WebSocket open", () => {
    const { onStatusChange } = renderConnected("test-pane")

    act(() => {
      capturedWs!.simulateOpen()
    })

    expect(onStatusChange).toHaveBeenCalledWith("connected")
  })

  it("sends typed resize control message on connect", () => {
    renderConnected("test-pane")

    act(() => {
      capturedWs!.simulateOpen()
    })

    expect(capturedWs!.send).toHaveBeenCalled()
    const payload = capturedWs!.send.mock.calls[0]?.[0] as ArrayBuffer
    const bytes = new Uint8Array(payload)
    expect(Array.from(bytes)).toEqual([1, 0, 80, 0, 24])
  })

  it("sets status to 'disconnected' on WebSocket close", () => {
    const { onStatusChange } = renderConnected("test-pane")

    act(() => {
      capturedWs!.simulateClose()
    })

    expect(onStatusChange).toHaveBeenCalledWith("disconnected")
  })

  it("cleans up WebSocket and terminal on unmount", () => {
    const { unmount } = renderConnected("test-pane")
    const ws = capturedWs!
    const results = vi.mocked(Terminal).mock.results
    const terminalInstance = results[results.length - 1]!.value

    unmount()

    expect(ws.close).toHaveBeenCalled()
    expect(terminalInstance.dispose).toHaveBeenCalled()
  })

  it("does not connect when paneId is null", () => {
    renderHook(() => useTerminal({ paneId: null, onStatusChange: vi.fn() }))

    expect(globalThis.WebSocket).not.toHaveBeenCalled()
  })
})
