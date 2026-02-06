# Phase 3: React Frontend

> **For Claude:** Use tina:executing-plans to implement this plan.

## Context

Phase 2 created the tina-web Axum backend with:
- REST API at `http://localhost:3100/api/`:
  - `GET /api/health` -> `{ status: "ok" }`
  - `GET /api/orchestrations` -> `Vec<Orchestration>`
  - `GET /api/orchestrations/:id` -> `Orchestration`
  - `GET /api/orchestrations/:id/tasks` -> `Vec<Task>`
  - `GET /api/orchestrations/:id/team` -> `Vec<Agent>`
  - `GET /api/orchestrations/:id/phases` -> `PhasesResponse { current_phase, total_phases, task_summary }`
- WebSocket at `ws://localhost:3100/ws`:
  - Server pushes `{ type: "orchestrations_updated", data: [...] }` on file changes
  - Initial state sent on connect
- Static file serving from `tina-web/frontend/dist/` when present
- CORS enabled for development

The `Orchestration` type (from `tina-data/src/discovery.rs`) serializes as:
```json
{
  "team_name": "string",
  "title": "string",
  "feature_name": "string",
  "cwd": "string (path)",
  "current_phase": 1,
  "total_phases": 3,
  "design_doc_path": "string (path)",
  "context_percent": 42,
  "status": { "executing": { "phase": 2 } },
  "orchestrator_tasks": [Task...],
  "tasks": [Task...],
  "members": [Agent...]
}
```

`OrchestrationStatus` serializes as tagged enum: `"executing"` with `{ phase }`, `"blocked"` with `{ phase, reason }`, `"complete"`, or `"idle"`.

`Task` serializes as:
```json
{
  "id": "1",
  "subject": "Task name",
  "description": "Details",
  "activeForm": "Working on task",
  "status": "pending|in_progress|completed",
  "owner": "agent-name",
  "blocks": ["2"],
  "blockedBy": ["0"],
  "metadata": {}
}
```

`Agent` serializes as:
```json
{
  "agentId": "uuid",
  "name": "worker-1",
  "agentType": "general-purpose",
  "model": "claude-opus-4-5-20251101",
  "joinedAt": 1706644800000,
  "tmuxPaneId": "%1",
  "cwd": "/path/to/worktree",
  "subscriptions": []
}
```

`TaskSummary` serializes as:
```json
{
  "total": 5,
  "completed": 2,
  "in_progress": 1,
  "pending": 1,
  "blocked": 1
}
```

## Goal

Create the React frontend in `tina-web/frontend/`. Vite + React + TypeScript + Tailwind CSS. Two views: an orchestration list (landing page) and an orchestration detail view. WebSocket subscription for live updates. Vite dev proxy to backend at port 3100.

## Architecture

```
tina-web/frontend/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types.ts
    ├── hooks/
    │   └── useOrchestrations.ts
    └── components/
        ├── OrchestrationList.tsx
        ├── OrchestrationDetail.tsx
        ├── TaskList.tsx
        ├── TeamPanel.tsx
        └── StatusBar.tsx
```

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 600 |

### Phase Estimates

| Task | Est. Lines | Model |
|------|-----------|-------|
| Task 1: Vite scaffold + config | ~60 | haiku |
| Task 2: TypeScript types | ~80 | haiku |
| Task 3: WebSocket hook | ~80 | haiku |
| Task 4: OrchestrationList | ~100 | haiku |
| Task 5: OrchestrationDetail | ~120 | haiku |
| Task 6: StatusBar + App routing | ~60 | haiku |
| Task 7: Verify build | ~10 | haiku |
| **Total** | **~510** | |

ROI: Minimal logic, mostly structural scaffolding and layout. All tasks are mechanical -- haiku for all.

---

## Tasks

### Task 1: Vite + React + TypeScript + Tailwind scaffold

**Files:**
- `tina-web/frontend/package.json`
- `tina-web/frontend/vite.config.ts`
- `tina-web/frontend/tailwind.config.ts`
- `tina-web/frontend/tsconfig.json`
- `tina-web/frontend/tsconfig.node.json`
- `tina-web/frontend/index.html`
- `tina-web/frontend/src/main.tsx`
- `tina-web/frontend/postcss.config.js`
- `tina-web/frontend/src/index.css`

**Model:** haiku

**Steps:**

1. Create `tina-web/frontend/package.json`:

```json
{
  "name": "tina-web-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

2. Create `tina-web/frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3100",
        ws: true,
      },
    },
  },
});
```

3. Create `tina-web/frontend/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
```

4. Create `tina-web/frontend/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

5. Create `tina-web/frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
```

6. Create `tina-web/frontend/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

7. Create `tina-web/frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tina Web</title>
  </head>
  <body class="bg-gray-950 text-gray-100 min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

8. Create `tina-web/frontend/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

9. Create `tina-web/frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

10. Run:

```bash
cd tina-web/frontend && npm install
```

Expected: `node_modules/` created, no errors.

---

### Task 2: TypeScript types matching Rust schemas

**Files:**
- `tina-web/frontend/src/types.ts`

**Model:** haiku

**Steps:**

1. Create `tina-web/frontend/src/types.ts` matching the exact JSON serialization from the Rust backend:

```typescript
// Matches tina-data/src/discovery.rs::OrchestrationStatus
// Tagged enum serialization (serde rename_all = "snake_case")
export type OrchestrationStatus =
  | { executing: { phase: number } }
  | { blocked: { phase: number; reason: string } }
  | "complete"
  | "idle";

// Matches tina-session Task (serde rename)
export interface Task {
  id: string;
  subject: string;
  description: string;
  activeForm: string | null;
  status: "pending" | "in_progress" | "completed";
  owner: string | null;
  blocks: string[];
  blockedBy: string[];
  metadata: unknown;
}

// Matches tina-session Agent (serde rename)
export interface Agent {
  agentId: string;
  name: string;
  agentType: string | null;
  model: string;
  joinedAt: number;
  tmuxPaneId: string | null;
  cwd: string;
  subscriptions: string[];
}

// Matches tina-data/src/discovery.rs::Orchestration
export interface Orchestration {
  team_name: string;
  title: string;
  feature_name: string;
  cwd: string;
  current_phase: number;
  total_phases: number;
  design_doc_path: string;
  context_percent: number | null;
  status: OrchestrationStatus;
  orchestrator_tasks: Task[];
  tasks: Task[];
  members: Agent[];
}

// Matches tina-data/src/tasks.rs::TaskSummary
export interface TaskSummary {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  blocked: number;
}

// WebSocket message from server
export interface WsMessage {
  type: "orchestrations_updated";
  data: Orchestration[];
}
```

No run step needed. Types are validated by TypeScript compilation in task 7.

---

### Task 3: WebSocket hook with reconnection

**Files:**
- `tina-web/frontend/src/hooks/useOrchestrations.ts`

**Model:** haiku

**Steps:**

1. Create `tina-web/frontend/src/hooks/useOrchestrations.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import type { Orchestration, WsMessage } from "../types";

const WS_URL =
  (window.location.protocol === "https:" ? "wss://" : "ws://") +
  window.location.host +
  "/ws";

const RECONNECT_DELAY_MS = 3000;

export function useOrchestrations() {
  const [orchestrations, setOrchestrations] = useState<Orchestration[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type === "orchestrations_updated") {
          setOrchestrations(msg.data);
          setLastUpdate(new Date());
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { orchestrations, connected, lastUpdate };
}
```

No run step. Validated at build time.

---

### Task 4: OrchestrationList component

**Files:**
- `tina-web/frontend/src/components/OrchestrationList.tsx`

**Model:** haiku

**Steps:**

1. Create `tina-web/frontend/src/components/OrchestrationList.tsx`:

```tsx
import { Link } from "react-router-dom";
import type { Orchestration, OrchestrationStatus } from "../types";

function statusLabel(status: OrchestrationStatus): string {
  if (status === "complete") return "Complete";
  if (status === "idle") return "Idle";
  if (typeof status === "object") {
    if ("executing" in status) return `Executing (phase ${status.executing.phase})`;
    if ("blocked" in status) return `Blocked (phase ${status.blocked.phase})`;
  }
  return "Unknown";
}

function statusColor(status: OrchestrationStatus): string {
  if (status === "complete") return "text-blue-400";
  if (status === "idle") return "text-gray-500";
  if (typeof status === "object") {
    if ("executing" in status) return "text-green-400";
    if ("blocked" in status) return "text-red-400";
  }
  return "text-gray-400";
}

function taskProgress(orch: Orchestration): string {
  const completed = orch.tasks.filter((t) => t.status === "completed").length;
  return `${completed}/${orch.tasks.length}`;
}

interface Props {
  orchestrations: Orchestration[];
}

export default function OrchestrationList({ orchestrations }: Props) {
  if (orchestrations.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No orchestrations found
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Orchestrations</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-left">
            <th className="pb-2 pr-4">Team</th>
            <th className="pb-2 pr-4">Feature</th>
            <th className="pb-2 pr-4">Phase</th>
            <th className="pb-2 pr-4">Tasks</th>
            <th className="pb-2 pr-4">Context</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {orchestrations.map((orch) => (
            <tr
              key={orch.team_name}
              className="border-b border-gray-900 hover:bg-gray-900/50"
            >
              <td className="py-2 pr-4">
                <Link
                  to={`/orchestration/${encodeURIComponent(orch.team_name)}`}
                  className="text-cyan-400 hover:underline"
                >
                  {orch.team_name}
                </Link>
              </td>
              <td className="py-2 pr-4">{orch.feature_name}</td>
              <td className="py-2 pr-4 font-mono">
                {orch.current_phase}/{orch.total_phases}
              </td>
              <td className="py-2 pr-4 font-mono">{taskProgress(orch)}</td>
              <td className="py-2 pr-4 font-mono">
                {orch.context_percent != null ? `${orch.context_percent}%` : "--"}
              </td>
              <td className={`py-2 ${statusColor(orch.status)}`}>
                {statusLabel(orch.status)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

No run step. Validated at build time.

---

### Task 5: OrchestrationDetail, TaskList, and TeamPanel components

**Files:**
- `tina-web/frontend/src/components/OrchestrationDetail.tsx`
- `tina-web/frontend/src/components/TaskList.tsx`
- `tina-web/frontend/src/components/TeamPanel.tsx`

**Model:** haiku

**Steps:**

1. Create `tina-web/frontend/src/components/TaskList.tsx`:

```tsx
import type { Task } from "../types";

function statusIcon(status: Task["status"]): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[>]";
    case "pending":
      return "[ ]";
  }
}

function statusColor(status: Task["status"]): string {
  switch (status) {
    case "completed":
      return "text-green-400";
    case "in_progress":
      return "text-yellow-400";
    case "pending":
      return "text-gray-500";
  }
}

interface Props {
  tasks: Task[];
  title?: string;
}

export default function TaskList({ tasks, title = "Tasks" }: Props) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 mb-2">{title}</h3>
      {tasks.length === 0 ? (
        <p className="text-gray-600 text-sm">No tasks</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2 text-sm">
              <span className={`font-mono ${statusColor(task.status)}`}>
                {statusIcon(task.status)}
              </span>
              <div className="flex-1 min-w-0">
                <span>{task.subject}</span>
                {task.owner && (
                  <span className="text-cyan-400 ml-2">
                    &larr; {task.owner}
                  </span>
                )}
                {task.blockedBy.length > 0 && (
                  <span className="text-red-400 ml-2">(blocked)</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

2. Create `tina-web/frontend/src/components/TeamPanel.tsx`:

```tsx
import type { Agent } from "../types";

function shortenModel(model: string): string {
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  return model;
}

interface Props {
  members: Agent[];
}

export default function TeamPanel({ members }: Props) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 mb-2">Team</h3>
      {members.length === 0 ? (
        <p className="text-gray-600 text-sm">No members</p>
      ) : (
        <ul className="space-y-1">
          {members.map((member) => (
            <li key={member.agentId} className="flex items-center gap-2 text-sm">
              <span className={member.tmuxPaneId ? "text-green-400" : "text-gray-600"}>
                {member.tmuxPaneId ? "\u25cf" : "\u25cb"}
              </span>
              <span className="font-medium">{member.name}</span>
              {member.agentType && (
                <span className="text-gray-500">{member.agentType}</span>
              )}
              <span className="text-gray-600">{shortenModel(member.model)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

3. Create `tina-web/frontend/src/components/OrchestrationDetail.tsx`:

```tsx
import { Link, useParams } from "react-router-dom";
import type { Orchestration, OrchestrationStatus } from "../types";
import TaskList from "./TaskList";
import TeamPanel from "./TeamPanel";

function statusLabel(status: OrchestrationStatus): string {
  if (status === "complete") return "Complete";
  if (status === "idle") return "Idle";
  if (typeof status === "object") {
    if ("executing" in status) return "Executing";
    if ("blocked" in status) return "Blocked";
  }
  return "Unknown";
}

function statusBadgeClass(status: OrchestrationStatus): string {
  const base = "px-2 py-0.5 rounded text-xs font-medium";
  if (status === "complete") return `${base} bg-blue-900 text-blue-300`;
  if (status === "idle") return `${base} bg-gray-800 text-gray-400`;
  if (typeof status === "object") {
    if ("executing" in status) return `${base} bg-green-900 text-green-300`;
    if ("blocked" in status) return `${base} bg-red-900 text-red-300`;
  }
  return `${base} bg-gray-800 text-gray-400`;
}

interface Props {
  orchestrations: Orchestration[];
}

export default function OrchestrationDetail({ orchestrations }: Props) {
  const { id } = useParams<{ id: string }>();
  const orch = orchestrations.find((o) => o.team_name === id);

  if (!orch) {
    return (
      <div className="p-4">
        <Link to="/" className="text-cyan-400 hover:underline text-sm">
          &larr; Back
        </Link>
        <p className="mt-4 text-gray-500">Orchestration not found: {id}</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <Link to="/" className="text-cyan-400 hover:underline text-sm">
        &larr; Back
      </Link>

      {/* Header */}
      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{orch.feature_name}</h1>
          <span className={statusBadgeClass(orch.status)}>
            {statusLabel(orch.status)}
          </span>
        </div>
        <div className="text-sm text-gray-500 mt-1 space-x-4">
          <span>Team: {orch.team_name}</span>
          <span>
            Phase: {orch.current_phase}/{orch.total_phases}
          </span>
          {orch.context_percent != null && (
            <span>Context: {orch.context_percent}%</span>
          )}
        </div>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-lg p-4">
          <TaskList tasks={orch.tasks} title="Phase Tasks" />
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <TeamPanel members={orch.members} />
        </div>
        <div className="bg-gray-900 rounded-lg p-4 md:col-span-2">
          <TaskList tasks={orch.orchestrator_tasks} title="Orchestrator Tasks" />
        </div>
      </div>
    </div>
  );
}
```

No run step. Validated at build time.

---

### Task 6: StatusBar component and App routing

**Files:**
- `tina-web/frontend/src/components/StatusBar.tsx`
- `tina-web/frontend/src/App.tsx`

**Model:** haiku

**Steps:**

1. Create `tina-web/frontend/src/components/StatusBar.tsx`:

```tsx
interface Props {
  connected: boolean;
  lastUpdate: Date | null;
  orchestrationCount: number;
}

export default function StatusBar({
  connected,
  lastUpdate,
  orchestrationCount,
}: Props) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-4 py-1 flex items-center gap-4 text-xs text-gray-500">
      <span className="flex items-center gap-1">
        <span className={connected ? "text-green-400" : "text-red-400"}>
          {connected ? "\u25cf" : "\u25cb"}
        </span>
        {connected ? "Connected" : "Disconnected"}
      </span>
      {lastUpdate && (
        <span>Updated: {lastUpdate.toLocaleTimeString()}</span>
      )}
      <span>{orchestrationCount} orchestration{orchestrationCount !== 1 ? "s" : ""}</span>
    </div>
  );
}
```

2. Create `tina-web/frontend/src/App.tsx`:

```tsx
import { Route, Routes } from "react-router-dom";
import { useOrchestrations } from "./hooks/useOrchestrations";
import OrchestrationDetail from "./components/OrchestrationDetail";
import OrchestrationList from "./components/OrchestrationList";
import StatusBar from "./components/StatusBar";

export default function App() {
  const { orchestrations, connected, lastUpdate } = useOrchestrations();

  return (
    <div className="pb-8">
      <Routes>
        <Route
          path="/"
          element={<OrchestrationList orchestrations={orchestrations} />}
        />
        <Route
          path="/orchestration/:id"
          element={<OrchestrationDetail orchestrations={orchestrations} />}
        />
      </Routes>
      <StatusBar
        connected={connected}
        lastUpdate={lastUpdate}
        orchestrationCount={orchestrations.length}
      />
    </div>
  );
}
```

No run step. Validated at build time.

---

### Task 7: Install, type-check, and build

**Files:** none (verification only)

**Model:** haiku

**review:** spec-only

**Steps:**

1. Install dependencies and build:

```bash
cd tina-web/frontend && npm install && npm run build
```

Expected: clean build, `dist/` directory created with `index.html` and JS/CSS bundles. No TypeScript errors.

2. Verify the Rust backend can serve the built frontend:

```bash
cd tina-web && cargo build
```

Expected: compiles (backend already has static file serving for `frontend/dist/`).

---

## Success Criteria

1. `npm run build` in `tina-web/frontend/` succeeds with no TypeScript errors
2. OrchestrationList renders table of all orchestrations with team name, feature, phase, tasks, context %, status
3. Clicking a row navigates to OrchestrationDetail view
4. OrchestrationDetail shows header with feature name, status badge, phase progress
5. OrchestrationDetail shows phase tasks, team members, and orchestrator tasks
6. StatusBar shows WebSocket connection state, last update time, orchestration count
7. WebSocket hook auto-reconnects on disconnect
8. Vite dev server proxies `/api` and `/ws` to localhost:3100
9. `cargo run -p tina-web` serves built frontend from `frontend/dist/`
10. Total frontend source < 600 lines

## Not in This Phase

- Phase timeline/breakdown view (no endpoint for full phase details yet)
- Search/filter on orchestration list
- Expand/collapse task descriptions
- Dark/light theme toggle
- Error boundary or loading spinners
- Tests (Playwright validation is Phase 4)

## Verification Commands

```bash
# Frontend dev mode (requires backend running separately)
cd tina-web/frontend && npm run dev

# Build frontend
cd tina-web/frontend && npm run build

# Run backend serving built frontend
cd tina-web && cargo run

# Then open http://localhost:3100 in browser
```

## Risks

- **React Router v7 API changes**: v7 may have slightly different API from v6. Use `react-router-dom` v7 which maintains backward-compatible `BrowserRouter` / `Routes` / `Route` API. If v7 causes issues, pin to `^6.28.0`.
- **Tailwind v3 vs v4**: Pin to v3 (^3.4.0) which is well-established. v4 has different config format.
- **WebSocket URL construction**: Uses `window.location.host` which works in both dev (Vite proxy) and production (same origin). No hardcoded ports.
