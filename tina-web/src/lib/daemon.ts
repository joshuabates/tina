export const DAEMON_BASE =
  import.meta.env.VITE_DAEMON_URL ?? "http://localhost:7842"

export interface CreateSessionResponse {
  sessionName: string
  tmuxPaneId: string
}
