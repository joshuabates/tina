import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useTerminal, type TerminalStatus } from "@/hooks/useTerminal"
import { useServices } from "@/providers/RuntimeProvider"
import { fetchDaemon } from "@/hooks/useDaemonQuery"
import "xterm/css/xterm.css"
import styles from "./TerminalView.module.scss"

interface TerminalViewProps {
  paneId: string
  label: string
  type: "agent" | "adhoc"
  cli: string
  sessionName?: string
}

function statusDotClass(status: TerminalStatus): string {
  switch (status) {
    case "connected":
      return styles.statusDotConnected
    case "connecting":
      return styles.statusDotConnecting
    case "error":
      return styles.statusDotError
    default:
      return styles.statusDotDisconnected
  }
}

export function TerminalView({
  paneId,
  label,
  type,
  cli,
  sessionName,
}: TerminalViewProps) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<TerminalStatus>("disconnected")
  const { keyboardService } = useServices()

  const { containerRef, focus } = useTerminal({
    paneId,
    onStatusChange: setStatus,
  })

  // Block global keyboard shortcuts when terminal is mounted
  useEffect(() => {
    keyboardService.setModalScope("terminal")
    return () => {
      keyboardService.setModalScope(null)
    }
  }, [keyboardService])

  // Auto-focus terminal on mount
  useEffect(() => {
    const timer = window.setTimeout(focus, 100)
    return () => window.clearTimeout(timer)
  }, [focus])

  const handleDisconnect = useCallback(() => {
    navigate(-1)
  }, [navigate])

  const handleEndSession = useCallback(async () => {
    if (!sessionName) return
    try {
      await fetchDaemon(`/sessions/${encodeURIComponent(sessionName)}`, {}, "DELETE")
    } catch (error) {
      console.error("Failed to end session:", error)
    }
    navigate(-1)
  }, [sessionName, navigate])

  return (
    <div className={styles.container} data-testid="terminal-view">
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.badge}>{type === "agent" ? "agent" : cli}</span>
        {type === "adhoc" && sessionName && (
          <button
            type="button"
            className={`${styles.headerButton} ${styles.headerButtonDanger}`}
            onClick={handleEndSession}
          >
            End Session
          </button>
        )}
        <button
          type="button"
          className={styles.headerButton}
          onClick={handleDisconnect}
        >
          Disconnect
        </button>
      </div>

      <div
        ref={containerRef}
        className={styles.terminalCanvas}
        data-testid="terminal-canvas"
      />

      <div className={styles.statusBar}>
        <span className={`${styles.statusDot} ${statusDotClass(status)}`} />
        <span>{status}</span>
        <span>pane {paneId}</span>
      </div>
    </div>
  )
}
