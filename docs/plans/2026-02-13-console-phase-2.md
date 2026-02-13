# Agent Console Phase 2: tina-web Terminal View

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 72404054ca4f74f9ddbca750ec9af8e319756bcf

**Goal:** Add xterm.js-based terminal UI to tina-web. Build the `TerminalView` component, WebSocket connection hook, Sessions sidebar section, "New Session" dialog, and route wiring so users can connect to tmux panes from the browser.

**Architecture:** The tina-daemon WebSocket relay and Convex schema (`terminalSessions`, `listTerminalTargets`, `teamMembers.tmuxPaneId`) were delivered in Phase 1. This phase builds the frontend that connects to them.

**Key patterns:**
- Route params (`/terminal/:paneId`) for terminal state — no selection service extension
- `useTypedQuery` + `QueryDef` for Convex subscriptions
- `FormDialog` for modal dialogs
- `fetchDaemon` from `useDaemonQuery.ts` for daemon HTTP calls
- `keyboardService.setModalScope("terminal")` to block global shortcuts when terminal is focused
- `DataErrorBoundary` wrapper for error handling
- `SidebarItem` for session list entries
- SCSS modules following existing `_tokens.scss` variables

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 800 |

---

### Task 1: Install xterm.js dependencies

**Files:**
- `tina-web/package.json`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Install the four xterm.js packages specified in the design doc.

**Steps:**

1. Install xterm.js packages:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npm install xterm @xterm/addon-attach @xterm/addon-fit @xterm/addon-webgl
```

Expected: packages added to `dependencies` in `tina-web/package.json`, lock file updated.

2. Verify packages resolve:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && node -e "require.resolve('xterm'); require.resolve('@xterm/addon-attach'); require.resolve('@xterm/addon-fit'); require.resolve('@xterm/addon-webgl'); console.log('ok')"
```

Expected: `ok`

---

### Task 2: Add TerminalTarget schema and query definition

**Files:**
- `tina-web/src/schemas/terminalTarget.ts` (new)
- `tina-web/src/schemas/index.ts`
- `tina-web/src/services/data/queryDefs.ts`

**Model:** opus

**review:** spec-only

**Depends on:** none

Define the Effect schema for `TerminalTarget` matching the Convex `listTerminalTargets` query return shape, export it from schemas, and add a `TerminalTargetListQuery` def.

**Steps:**

1. Create `tina-web/src/schemas/terminalTarget.ts`:

```typescript
import { Schema } from "effect"

const TerminalContext = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
  summary: Schema.String,
})

export const TerminalTarget = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  tmuxSessionName: Schema.String,
  tmuxPaneId: Schema.String,
  type: Schema.Literal("agent", "adhoc"),
  cli: Schema.String,
  context: Schema.optional(TerminalContext),
})

export type TerminalTarget = typeof TerminalTarget.Type
```

2. Add export to `tina-web/src/schemas/index.ts`:

Add line:
```typescript
export { TerminalTarget } from "./terminalTarget"
```

3. Add query def to `tina-web/src/services/data/queryDefs.ts`:

```typescript
export const TerminalTargetListQuery = queryDef({
  key: "terminalTargets.list",
  query: api.terminalTargets.listTerminalTargets,
  args: Schema.Struct({}),
  schema: Schema.Array(TerminalTarget),
})
```

And add `TerminalTarget` to the imports from `@/schemas`.

4. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to terminalTarget files.

---

### Task 3: Build `useTerminal` WebSocket hook

**Files:**
- `tina-web/src/hooks/useTerminal.ts` (new)

**Model:** opus

**review:** full

**Depends on:** 1

Create a React hook that manages the WebSocket connection to the daemon's `/ws/terminal/{paneId}` endpoint, xterm.js Terminal instance lifecycle, and resize handling.

**Steps:**

1. Create `tina-web/src/hooks/useTerminal.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react"
import { Terminal } from "xterm"
import { AttachAddon } from "@xterm/addon-attach"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"

const DAEMON_BASE = import.meta.env.VITE_DAEMON_URL ?? "http://localhost:7842"

function buildWsUrl(paneId: string): string {
  const base = DAEMON_BASE.replace(/^http/, "ws")
  return `${base}/ws/terminal/${encodeURIComponent(paneId)}`
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
        const resizeMsg = new Uint8Array(4)
        resizeMsg[0] = (dims.cols >> 8) & 0xff
        resizeMsg[1] = dims.cols & 0xff
        resizeMsg[2] = (dims.rows >> 8) & 0xff
        resizeMsg[3] = dims.rows & 0xff
        ws.send(resizeMsg.buffer)
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
          const resizeMsg = new Uint8Array(4)
          resizeMsg[0] = (dims.cols >> 8) & 0xff
          resizeMsg[1] = dims.cols & 0xff
          resizeMsg[2] = (dims.rows >> 8) & 0xff
          resizeMsg[3] = dims.rows & 0xff
          ws.send(resizeMsg.buffer)
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
```

2. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to useTerminal.

---

### Task 4: Build `TerminalView` component

**Files:**
- `tina-web/src/components/TerminalView.tsx` (new)
- `tina-web/src/components/TerminalView.module.scss` (new)

**Model:** opus

**review:** full

**Depends on:** 3

Build the fullscreen terminal view component with header bar (session label, type badge, disconnect/end session buttons) and xterm.js canvas. Uses `useTerminal` hook and `keyboardService.setModalScope`.

**Steps:**

1. Create `tina-web/src/components/TerminalView.module.scss`:

```scss
@use '../styles/tokens' as *;

.container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0a0a0f;
}

.header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid $border-color;
  background: $bg-sidebar;
  flex-shrink: 0;
}

.label {
  font-size: 0.78rem;
  font-weight: 600;
  color: $text-primary;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  border: 1px solid $border-color;
  color: $text-muted;
  flex-shrink: 0;
}

.headerButton {
  font-size: 0.72rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.3rem;
  border: 1px solid $border-color;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    background: hsl(var(--muted) / 0.35);
    color: $text-primary;
  }
}

.headerButtonDanger {
  &:hover {
    border-color: hsl(var(--destructive, 0 84% 60%));
    color: hsl(var(--destructive, 0 84% 60%));
  }
}

.terminalCanvas {
  flex: 1;
  min-height: 0;
  padding: 4px;
}

.statusBar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.75rem;
  font-size: 0.65rem;
  color: $text-muted;
  border-top: 1px solid $border-color;
  background: $bg-sidebar;
  flex-shrink: 0;
}

.statusDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.statusDotConnected {
  background: hsl(142 76% 36%);
}

.statusDotConnecting {
  background: hsl(48 96% 53%);
}

.statusDotDisconnected {
  background: hsl(var(--muted-foreground));
}

.statusDotError {
  background: hsl(var(--destructive, 0 84% 60%));
}
```

2. Create `tina-web/src/components/TerminalView.tsx`:

```tsx
import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useTerminal, type TerminalStatus } from "@/hooks/useTerminal"
import { useAppServices } from "@/hooks/index"
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
  const { keyboardService } = useAppServices()

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
```

3. Extend `fetchDaemon` in `tina-web/src/hooks/useDaemonQuery.ts` to support methods other than GET:

In `useDaemonQuery.ts`, update the `fetchDaemon` function signature to accept an optional method parameter:

```typescript
export async function fetchDaemon<T>(
  path: string,
  params: Record<string, string>,
  method: string = "GET",
): Promise<T> {
  const url = new URL(path, DAEMON_BASE)
  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
  }
  const resp = await fetch(url.toString(), { method })
  if (!resp.ok) {
    throw new Error(`Daemon ${path}: ${resp.status} ${await resp.text()}`)
  }
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}
```

4. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to TerminalView files.

---

### Task 5: Add Sessions sidebar and route wiring

**Files:**
- `tina-web/src/components/AppShell.tsx`
- `tina-web/src/components/modes/SessionsModePage.tsx`
- `tina-web/src/App.tsx`

**Model:** opus

**review:** full

**Depends on:** 2, 4

Replace the placeholder `SessionsSidebar` and `SessionsModePage` with real implementations that subscribe to `listTerminalTargets`, list sessions with `SidebarItem`, and navigate to the terminal view route. Add the `/terminal/:paneId` route.

**Steps:**

1. Update `SessionsModePage` to show terminal view or session list:

Replace `tina-web/src/components/modes/SessionsModePage.tsx` with:

```tsx
import { useParams, useSearchParams } from "react-router-dom"
import { DataErrorBoundary } from "@/components/DataErrorBoundary"
import { TerminalView } from "@/components/TerminalView"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TerminalTargetListQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import type { TerminalTarget } from "@/schemas"
import emptyStyles from "./ModeEmptyState.module.scss"

function SessionsContent() {
  const [searchParams] = useSearchParams()
  const paneId = searchParams.get("pane")

  const targetsResult = useTypedQuery(TerminalTargetListQuery, {})

  if (isAnyQueryLoading(targetsResult)) {
    return (
      <section data-testid="sessions-mode-page" className={emptyStyles.page}>
        <p className={emptyStyles.description}>Loading sessions...</p>
      </section>
    )
  }

  const queryError = firstQueryError(targetsResult)
  if (queryError) {
    throw queryError
  }

  if (targetsResult.status !== "success") return null

  // If a pane is selected via search params, show terminal view
  if (paneId) {
    const target = targetsResult.data.find(
      (t: TerminalTarget) => t.tmuxPaneId === paneId,
    )

    if (target) {
      return (
        <TerminalView
          paneId={target.tmuxPaneId}
          label={target.label}
          type={target.type}
          cli={target.cli}
          sessionName={target.tmuxSessionName}
        />
      )
    }

    // Pane not found — show message
    return (
      <section data-testid="sessions-mode-page" className={emptyStyles.page}>
        <h1 className={emptyStyles.title}>Session not found</h1>
        <p className={emptyStyles.description}>
          Terminal pane {paneId} is no longer available.
        </p>
      </section>
    )
  }

  // No pane selected — show empty state
  if (targetsResult.data.length === 0) {
    return (
      <section data-testid="sessions-mode-page" className={emptyStyles.page}>
        <h1 className={emptyStyles.title}>Sessions</h1>
        <p className={emptyStyles.description}>
          No active sessions. Start an orchestration or create a new session.
        </p>
      </section>
    )
  }

  return (
    <section data-testid="sessions-mode-page" className={emptyStyles.page}>
      <h1 className={emptyStyles.title}>Sessions</h1>
      <p className={emptyStyles.description}>
        Select a session from the sidebar to connect.
      </p>
    </section>
  )
}

export function SessionsModePage() {
  return (
    <DataErrorBoundary panelName="sessions">
      <SessionsContent />
    </DataErrorBoundary>
  )
}
```

2. Update `SessionsSidebar` in `AppShell.tsx`:

Replace the `SessionsSidebar` function in `tina-web/src/components/AppShell.tsx` with:

```tsx
function SessionsSidebar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showNewSession, setShowNewSession] = useState(false)
  const targetsResult = useTypedQuery(TerminalTargetListQuery, {})
  const activePaneId = searchParams.get("pane")

  return (
    <div className={styles.modeSidebarContent}>
      <div className={styles.modeSidebarHeader}>Sessions</div>
      {targetsResult.status === "success" && targetsResult.data.length > 0 && (
        <div className={styles.modeSidebarSection}>
          {targetsResult.data.map((target: TerminalTarget) => (
            <SidebarItem
              key={target.id}
              label={target.label}
              active={target.tmuxPaneId === activePaneId}
              statusIndicatorClass={
                target.type === "agent"
                  ? "bg-emerald-500"
                  : "bg-sky-400"
              }
              onClick={() => {
                setSearchParams({ pane: target.tmuxPaneId })
              }}
            />
          ))}
        </div>
      )}
      {targetsResult.status === "loading" && (
        <p className={styles.modeSidebarHint}>Loading sessions...</p>
      )}
      {targetsResult.status === "success" && targetsResult.data.length === 0 && (
        <p className={styles.modeSidebarHint}>No active sessions.</p>
      )}
      <button
        type="button"
        className={styles.modeSidebarButton}
        data-sidebar-action
        onClick={() => setShowNewSession(true)}
      >
        New session
      </button>
      {showNewSession && (
        <NewSessionDialog
          onClose={() => setShowNewSession(false)}
          onCreated={(paneId) => {
            setShowNewSession(false)
            setSearchParams({ pane: paneId })
          }}
        />
      )}
    </div>
  )
}
```

Add necessary imports at the top of `AppShell.tsx`:
```typescript
import { useSearchParams } from "react-router-dom"  // add to existing import
import { useState } from "react"  // add to existing import
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { TerminalTargetListQuery } from "@/services/data/queryDefs"
import { SidebarItem } from "@/components/ui/sidebar-item"
import type { TerminalTarget } from "@/schemas"
import { NewSessionDialog } from "@/components/NewSessionDialog"
```

Note: `useTypedQuery` is already imported in AppShell. Only add the new ones.

3. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (will show error about missing NewSessionDialog — that's Task 6).

---

### Task 6: Build NewSessionDialog component

**Files:**
- `tina-web/src/components/NewSessionDialog.tsx` (new)

**Model:** opus

**review:** full

**Depends on:** 4

Build a dialog for creating new ad-hoc terminal sessions. Uses `FormDialog`, calls `POST /sessions` on the daemon, returns the created pane ID.

**Steps:**

1. Create `tina-web/src/components/NewSessionDialog.tsx`:

```tsx
import { useState } from "react"
import { FormDialog } from "@/components/FormDialog"
import styles from "@/components/FormDialog.module.scss"

const DAEMON_BASE = import.meta.env.VITE_DAEMON_URL ?? "http://localhost:7842"

interface NewSessionDialogProps {
  onClose: () => void
  onCreated: (paneId: string) => void
}

interface CreateSessionResponse {
  sessionName: string
  tmuxPaneId: string
}

export function NewSessionDialog({ onClose, onCreated }: NewSessionDialogProps) {
  const [label, setLabel] = useState("")
  const [cli, setCli] = useState<"claude" | "codex">("claude")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      const resp = await fetch(`${DAEMON_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), cli }),
      })

      if (!resp.ok) {
        throw new Error(`Failed to create session: ${resp.status}`)
      }

      const data = (await resp.json()) as CreateSessionResponse
      onCreated(data.tmuxPaneId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog title="New Session" onClose={onClose} maxWidth={420}>
      <form onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="session-label">
            Label
          </label>
          <input
            id="session-label"
            className={styles.formInput}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Discuss auth middleware"
            autoFocus
          />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="session-cli">
            CLI
          </label>
          <select
            id="session-cli"
            className={styles.formInput}
            value={cli}
            onChange={(e) => setCli(e.target.value as "claude" | "codex")}
          >
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting || !label.trim()}
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </FormDialog>
  )
}
```

2. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: clean compile.

---

### Task 7: Add `useAppServices` hook for keyboard service access

**Files:**
- `tina-web/src/hooks/index.ts`

**Model:** opus

**review:** spec-only

**Depends on:** none

Check if `useAppServices` already exists and provides `keyboardService`. If it doesn't exist, create a minimal version or adjust `TerminalView` to access the keyboard service through the existing pattern.

**Steps:**

1. Read `tina-web/src/hooks/index.ts` to see what's exported.

2. Search for how the keyboard service is accessed in the app (look for `keyboardService` usage patterns).

3. If `useAppServices` doesn't exist, update `TerminalView` (Task 4) to access the keyboard service through the existing mechanism — likely via a React context or direct import from a service module.

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && grep -r "keyboardService" src/ --include="*.ts" --include="*.tsx" -l
```

Expected: identify the pattern used to access keyboard service.

Adapt `TerminalView` accordingly. If keyboard service is created as a singleton module, import it directly. If it's provided via context, use the context hook.

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: clean compile.

---

### Task 8: Write tests for useTerminal hook

**Files:**
- `tina-web/src/hooks/__tests__/useTerminal.test.ts` (new)

**Model:** opus

**review:** spec-only

**Depends on:** 3

Write unit tests for the `useTerminal` hook covering connection lifecycle and cleanup.

**Steps:**

1. Create test file `tina-web/src/hooks/__tests__/useTerminal.test.ts`:

Test cases:
- Returns containerRef that can be attached to a DOM element
- Sets status to "connecting" when paneId is provided
- Sets status to "connected" on WebSocket open
- Sets status to "disconnected" on WebSocket close
- Cleans up WebSocket and terminal on unmount
- Does not connect when paneId is null

Use mock WebSocket (mock the global WebSocket constructor) and mock xterm.js Terminal (vi.mock("xterm")).

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx vitest run src/hooks/__tests__/useTerminal.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

---

### Task 9: Write tests for SessionsModePage

**Files:**
- `tina-web/src/components/__tests__/SessionsModePage.test.tsx` (new)

**Model:** opus

**review:** spec-only

**Depends on:** 5

Write unit tests for the `SessionsModePage` component covering:
- Renders loading state
- Renders empty state when no sessions
- Renders "select a session" prompt when sessions exist but none selected
- Renders TerminalView when pane search param is set and target found
- Renders "not found" when pane search param doesn't match any target

Follow the existing test pattern from `Sidebar.test.tsx` using `renderWithAppRuntime` and `vi.mock("@/hooks/useTypedQuery")`.

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx vitest run src/components/__tests__/SessionsModePage.test.tsx 2>&1 | tail -20
```

Expected: all tests pass.

---

### Task 10: Write tests for NewSessionDialog

**Files:**
- `tina-web/src/components/__tests__/NewSessionDialog.test.tsx` (new)

**Model:** opus

**review:** spec-only

**Depends on:** 6

Write unit tests for the `NewSessionDialog` component:
- Renders form with label input, CLI select, and Create button
- Submit button is disabled when label is empty
- Calls POST /sessions on submit and invokes onCreated with paneId
- Shows error message on fetch failure
- Calls onClose when Cancel is clicked

Mock global `fetch`.

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx vitest run src/components/__tests__/NewSessionDialog.test.tsx 2>&1 | tail -20
```

Expected: all tests pass.

---

### Task 11: Verify full build and test suite

**Files:**
- (none — verification only)

**Model:** haiku

**review:** spec-only

**Depends on:** 7, 8, 9, 10

Run full typecheck and test suite to ensure nothing is broken.

**Steps:**

1. Run typecheck:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit
```

Expected: no errors.

2. Run test suite:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass.

3. Run build:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

---

## Phase Estimates

| Task | Estimate | Parallelizable with |
|------|----------|---------------------|
| 1. Install deps | 2 min | 2, 7 |
| 2. Schema + query def | 3 min | 1, 7 |
| 3. useTerminal hook | 5 min | — (needs 1) |
| 4. TerminalView component | 5 min | — (needs 3) |
| 5. Sidebar + routes | 5 min | 6 (needs 2, 4) |
| 6. NewSessionDialog | 4 min | 5 (needs 4) |
| 7. useAppServices audit | 3 min | 1, 2 |
| 8. useTerminal tests | 4 min | 9, 10 (needs 3) |
| 9. SessionsModePage tests | 4 min | 8, 10 (needs 5) |
| 10. NewSessionDialog tests | 3 min | 8, 9 (needs 6) |
| 11. Verify build | 3 min | — (needs all) |
| **Total** | **~41 min** | |

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
