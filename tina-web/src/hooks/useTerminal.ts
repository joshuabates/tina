import { useEffect, useRef, useCallback } from "react"
import { Terminal } from "xterm"
import { AttachAddon } from "@xterm/addon-attach"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import { DAEMON_BASE } from "../lib/daemon"

function buildWsUrl(paneId: string): string {
  const base = DAEMON_BASE.replace(/^http/, "ws")
  return `${base}/ws/terminal/${encodeURIComponent(paneId)}`
}

function encodeResizeMessage(cols: number, rows: number): ArrayBuffer {
  const msg = new Uint8Array(4)
  msg[0] = (cols >> 8) & 0xff
  msg[1] = cols & 0xff
  msg[2] = (rows >> 8) & 0xff
  msg[3] = rows & 0xff
  return msg.buffer
}

export type TerminalStatus = "connecting" | "connected" | "disconnected" | "error"

export interface UseTerminalOptions {
  paneId: string | null
  onStatusChange?: (status: TerminalStatus) => void
}

export function useTerminal({ paneId, onStatusChange }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const statusRef = useRef<TerminalStatus>("disconnected")

  const setStatus = useCallback(
    (status: TerminalStatus) => {
      statusRef.current = status
      onStatusChange?.(status)
    },
    [onStatusChange],
  )

  useEffect(() => {
    if (!paneId || !containerRef.current) return

    const terminal = new Terminal({
      scrollback: 5000,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      theme: {
        background: "#0a0a0f",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        selectionBackground: "#3f3f46",
      },
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    // Try WebGL renderer, fall back silently
    try {
      terminal.loadAddon(new WebglAddon())
    } catch {
      // Canvas fallback is automatic
    }

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // WebSocket connection
    setStatus("connecting")
    const ws = new WebSocket(buildWsUrl(paneId))
    ws.binaryType = "arraybuffer"
    wsRef.current = ws

    ws.addEventListener("open", () => {
      setStatus("connected")
      const attachAddon = new AttachAddon(ws)
      terminal.loadAddon(attachAddon)

      // Send initial resize
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        ws.send(encodeResizeMessage(dims.cols, dims.rows))
      }
    })

    ws.addEventListener("close", () => {
      setStatus("disconnected")
    })

    ws.addEventListener("error", () => {
      setStatus("error")
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          ws.send(encodeResizeMessage(dims.cols, dims.rows))
        }
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      ws.close()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      wsRef.current = null
    }
  }, [paneId, setStatus])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  return { containerRef, focus }
}
