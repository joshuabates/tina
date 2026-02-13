import { useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { DAEMON_BASE } from "@/lib/daemon"
import { buildModePath } from "@/lib/navigation"

interface CreateSessionOptions {
  label: string
  cli?: "claude" | "codex"
  contextType?: "task" | "plan" | "commit" | "design" | "freeform"
  contextId?: string
  contextSummary?: string
}

interface CreateSessionResponse {
  sessionName: string
  tmuxPaneId: string
}

export function useCreateSession() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const connectToPane = useCallback(
    (paneId: string) => {
      if (!projectId) return
      const base = buildModePath(projectId, "sessions")
      navigate(`${base}?pane=${encodeURIComponent(paneId)}`)
    },
    [projectId, navigate],
  )

  const createAndConnect = useCallback(
    async (options: CreateSessionOptions) => {
      if (!projectId) return

      const resp = await fetch(`${DAEMON_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: options.label,
          cli: options.cli ?? "claude",
          contextType: options.contextType,
          contextId: options.contextId,
          contextSummary: options.contextSummary,
        }),
      })

      if (!resp.ok) {
        throw new Error(`Failed to create session: ${resp.status}`)
      }

      const data = (await resp.json()) as CreateSessionResponse
      connectToPane(data.tmuxPaneId)
    },
    [projectId, connectToPane],
  )

  return { createAndConnect, connectToPane }
}
