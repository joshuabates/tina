# Phase 2: Service Layer — Implementation Plan

## Phase Goal

Build the Effect-TS service layer and React integration hooks that provide typed data access, action dispatch, keyboard handling, focus management, and URL-backed selection state. Every service is testable with mock layers; no Convex connection required in tests.

## Prerequisites (from Phase 1)

- Effect Schemas defined in `src/schemas/` (OrchestrationSummary, Phase, TaskEvent, TeamMember, ProjectSummary, OrchestrationEvent, OrchestrationDetail)
- `_tokens.scss` bridge in `src/styles/`
- Vitest config with jsdom environment
- `convex.ts` client singleton with profile selection
- `effect` ^3.19, `@testing-library/react`, `@testing-library/user-event` installed

## Deliverable

Services working with tests, data flowing through hooks in a minimal test harness. All service logic testable without Convex. `RuntimeProvider` composing all layers at app root.

---

## Step-by-step Implementation

### Step 1: Typed error module

**Create `src/services/errors.ts`**

Define the shared error types used across services:

```typescript
import { Schema } from "effect"

export class QueryValidationError extends Schema.TaggedError<QueryValidationError>()(
  "QueryValidationError",
  { query: Schema.String, message: Schema.String },
) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { resource: Schema.String, id: Schema.String },
) {}

export class PermissionError extends Schema.TaggedError<PermissionError>()(
  "PermissionError",
  { message: Schema.String },
) {}

export class TransientDataError extends Schema.TaggedError<TransientDataError>()(
  "TransientDataError",
  { query: Schema.String, message: Schema.String },
) {}
```

**Test:** Unit test each error type constructs correctly and has the expected `_tag`.

---

### Step 2: Convex ID helpers

**Create `src/services/data/id.ts`**

Typed helper functions for converting route param strings to Convex IDs. No inline `as Id<...>` casts anywhere else.

```typescript
import { Id } from "@convex/_generated/dataModel"
import { NotFoundError } from "../errors"

// Validate and convert a string to a Convex ID.
// Returns the ID or throws NotFoundError for invalid/empty values.
export function toOrchestrationId(raw: string | undefined): Id<"orchestrations"> {
  if (!raw) throw new NotFoundError({ resource: "orchestration", id: raw ?? "" })
  return raw as Id<"orchestrations">
}

export function toProjectId(raw: string | undefined): Id<"projects"> {
  if (!raw) throw new NotFoundError({ resource: "project", id: raw ?? "" })
  return raw as Id<"projects">
}
```

Keep these as the single place where `as Id<T>` casts happen.

**Test:** Valid string returns the ID. Empty/undefined throws `NotFoundError`.

---

### Step 3: Status constants

**Create `src/services/data/status.ts`**

Named constants for orchestration/phase status strings to avoid string literals scattered in components:

```typescript
export const OrchestrationStatus = {
  Planning: "planning",
  Executing: "executing",
  Reviewing: "reviewing",
  Complete: "complete",
  Blocked: "blocked",
} as const

export type OrchestrationStatus = (typeof OrchestrationStatus)[keyof typeof OrchestrationStatus]

export const PhaseStatus = {
  Pending: "pending",
  Planning: "planning",
  Executing: "executing",
  Reviewing: "reviewing",
  Complete: "complete",
  Failed: "failed",
} as const

export type PhaseStatus = (typeof PhaseStatus)[keyof typeof PhaseStatus]

export const TaskStatus = {
  Pending: "pending",
  InProgress: "in_progress",
  Completed: "completed",
  Blocked: "blocked",
} as const

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]
```

**Test:** Verify each constant maps to expected string value.

---

### Step 4: Query definition registry (DataService core)

**Create `src/services/data/queryDefs.ts`**

Define `QueryDef` objects pairing Convex API references with Effect Schemas. This is the single registry of all queries the UI consumes.

```typescript
import { Schema } from "effect"
import { api } from "@convex/_generated/api"
import { OrchestrationSummary, OrchestrationDetail, ProjectSummary, OrchestrationEvent } from "@/schemas"

export interface QueryDef<A, Args = Record<string, never>> {
  key: string
  query: unknown  // Convex FunctionReference — typed at use site
  args: Schema.Schema<Args>
  schema: Schema.Schema<A>
}

function queryDef<A, Args = Record<string, never>>(def: QueryDef<A, Args>): QueryDef<A, Args> {
  return def
}

export const OrchestrationListQuery = queryDef({
  key: "orchestrations.list",
  query: api.orchestrations.listOrchestrations,
  args: Schema.Struct({}),
  schema: Schema.Array(OrchestrationSummary),
})

export const OrchestrationDetailQuery = queryDef({
  key: "orchestrations.detail",
  query: api.orchestrations.getOrchestrationDetail,
  args: Schema.Struct({ orchestrationId: Schema.String }),
  schema: OrchestrationDetail,
})

export const ProjectListQuery = queryDef({
  key: "projects.list",
  query: api.projects.listProjects,
  args: Schema.Struct({}),
  schema: Schema.Array(ProjectSummary),
})

export const EventListQuery = queryDef({
  key: "events.list",
  query: api.events.listEvents,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    since: Schema.optional(Schema.String),
    limit: Schema.optional(Schema.Number),
  }),
  schema: Schema.Array(OrchestrationEvent),
})
```

**Test:** Each QueryDef has a key, query reference, and schema. Schema decode works on valid data and rejects invalid data.

---

### Step 5: Decode boundary (`decodeOrThrow`)

**Create `src/services/data/decode.ts`**

Single decode boundary function used by all typed query hooks:

```typescript
import { Schema, Either, ParseResult } from "effect"
import { QueryValidationError } from "../errors"

export function decodeOrThrow<A>(queryKey: string, schema: Schema.Schema<A>, raw: unknown): A {
  const result = Schema.decodeUnknownEither(schema)(raw)
  if (Either.isRight(result)) return result.right
  throw new QueryValidationError({
    query: queryKey,
    message: ParseResult.TreeFormatter.formatErrorSync(result.left),
  })
}
```

**Test:** Valid data decodes. Invalid data throws `QueryValidationError` with the query key and a message.

---

### Step 6: `useTypedQuery` hook

**Create `src/hooks/useTypedQuery.ts`**

The canonical hook for consuming Convex queries with schema validation:

```typescript
import { useQuery } from "convex/react"
import type { FunctionReference } from "convex/server"
import type { QueryDef } from "@/services/data/queryDefs"
import { decodeOrThrow } from "@/services/data/decode"

export type TypedQueryResult<A> =
  | { status: "loading" }
  | { status: "success"; data: A }
  | { status: "error"; error: unknown }

export function useTypedQuery<A, Args extends Record<string, unknown>>(
  def: QueryDef<A, Args>,
  args: Args,
): TypedQueryResult<A> {
  const raw = useQuery(def.query as FunctionReference<"query">, args)

  if (raw === undefined) return { status: "loading" }

  try {
    const data = decodeOrThrow(def.key, def.schema, raw)
    return { status: "success", data }
  } catch (error) {
    return { status: "error", error }
  }
}
```

**Test:** With a mock Convex provider or by testing `decodeOrThrow` directly (the hook is a thin wrapper). Test loading state (undefined), success state (valid data), error state (invalid data).

---

### Step 7: ActionRegistry service

**Create `src/services/action-registry.ts`**

Named actions with metadata. Plain functions wrapped in descriptors. Duplicate `(scope, keybinding)` registrations are rejected.

```typescript
export interface ActionDescriptor {
  id: string
  label: string
  key?: string          // keybinding (e.g., "Space", "Enter", "Alt+r")
  when?: string         // focus context (e.g., "sidebar.focused")
  icon?: string         // lucide icon name
  execute: (ctx: ActionContext) => void
}

export interface ActionContext {
  selectedItem?: string
  focusedSection?: string
  [key: string]: unknown
}

export function createActionRegistry() {
  const actions = new Map<string, ActionDescriptor>()
  const bindings = new Map<string, string>() // "scope:key" -> actionId

  function register(descriptor: ActionDescriptor): () => void {
    if (actions.has(descriptor.id)) {
      // Idempotent for StrictMode — same ID re-registration is fine
      actions.set(descriptor.id, descriptor)
    } else {
      actions.set(descriptor.id, descriptor)
    }

    // Register keybinding if present
    if (descriptor.key && descriptor.when) {
      const bindingKey = `${descriptor.when}:${descriptor.key}`
      const existing = bindings.get(bindingKey)
      if (existing && existing !== descriptor.id) {
        throw new Error(
          `Keybinding conflict: "${descriptor.key}" in scope "${descriptor.when}" ` +
          `already bound to "${existing}", cannot bind to "${descriptor.id}"`
        )
      }
      bindings.set(bindingKey, descriptor.id)
    }

    // Cleanup function for useEffect
    return () => {
      actions.delete(descriptor.id)
      if (descriptor.key && descriptor.when) {
        bindings.delete(`${descriptor.when}:${descriptor.key}`)
      }
    }
  }

  function get(id: string): ActionDescriptor | undefined {
    return actions.get(id)
  }

  function resolve(key: string, scope: string): ActionDescriptor | undefined {
    const actionId = bindings.get(`${scope}:${key}`)
    if (!actionId) return undefined
    return actions.get(actionId)
  }

  function listForScope(scope: string): ActionDescriptor[] {
    return Array.from(actions.values()).filter((a) => a.when === scope)
  }

  function listAll(): ActionDescriptor[] {
    return Array.from(actions.values())
  }

  return { register, get, resolve, listForScope, listAll }
}

export type ActionRegistry = ReturnType<typeof createActionRegistry>
```

**Tests:**
- Register an action and retrieve it by ID
- Resolve a keybinding to the correct action
- Duplicate `(scope, key)` throws error
- Same ID re-registration is idempotent (StrictMode)
- Cleanup function removes action and binding
- `listForScope` returns only matching actions
- `listAll` returns all actions

---

### Step 8: FocusService

**Create `src/services/focus-service.ts`**

Tracks which section is focused and which item within that section. Provides roving-tabindex semantics.

```typescript
export interface FocusSection {
  id: string
  itemCount: number
}

export function createFocusService() {
  const sections: Map<string, FocusSection> = new Map()
  const sectionOrder: string[] = []
  let activeSectionId: string | null = null
  let activeItemIndex = 0
  const listeners: Set<() => void> = new Set()

  function notify() {
    listeners.forEach((fn) => fn())
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function registerSection(id: string, itemCount: number): () => void {
    sections.set(id, { id, itemCount })
    if (!sectionOrder.includes(id)) {
      sectionOrder.push(id)
    }
    if (!activeSectionId) {
      activeSectionId = id
      activeItemIndex = 0
    }
    notify()
    return () => {
      sections.delete(id)
      const idx = sectionOrder.indexOf(id)
      if (idx >= 0) sectionOrder.splice(idx, 1)
      if (activeSectionId === id) {
        activeSectionId = sectionOrder[0] ?? null
        activeItemIndex = 0
      }
      notify()
    }
  }

  function setItemCount(sectionId: string, count: number) {
    const section = sections.get(sectionId)
    if (section) {
      section.itemCount = count
      // Clamp active index
      if (activeSectionId === sectionId && activeItemIndex >= count) {
        activeItemIndex = Math.max(0, count - 1)
      }
      notify()
    }
  }

  function focusSection(id: string) {
    if (sections.has(id)) {
      activeSectionId = id
      activeItemIndex = 0
      notify()
    }
  }

  function focusNextSection() {
    if (sectionOrder.length === 0) return
    const currentIdx = activeSectionId ? sectionOrder.indexOf(activeSectionId) : -1
    const nextIdx = (currentIdx + 1) % sectionOrder.length
    activeSectionId = sectionOrder[nextIdx]
    activeItemIndex = 0
    notify()
  }

  function focusPrevSection() {
    if (sectionOrder.length === 0) return
    const currentIdx = activeSectionId ? sectionOrder.indexOf(activeSectionId) : 0
    const prevIdx = (currentIdx - 1 + sectionOrder.length) % sectionOrder.length
    activeSectionId = sectionOrder[prevIdx]
    activeItemIndex = 0
    notify()
  }

  function moveItem(delta: number) {
    if (!activeSectionId) return
    const section = sections.get(activeSectionId)
    if (!section || section.itemCount === 0) return
    activeItemIndex = Math.max(0, Math.min(section.itemCount - 1, activeItemIndex + delta))
    notify()
  }

  function getState() {
    return {
      activeSectionId,
      activeItemIndex,
      sections: Array.from(sections.values()),
    }
  }

  return {
    subscribe,
    registerSection,
    setItemCount,
    focusSection,
    focusNextSection,
    focusPrevSection,
    moveItem,
    getState,
  }
}

export type FocusService = ReturnType<typeof createFocusService>
```

**Tests:**
- Register a section, it becomes active by default
- Register multiple sections, tab cycles between them
- Arrow movement clamps to item bounds
- Unregister section cleans up and moves focus
- `setItemCount` clamps active index
- `getState` returns correct snapshot

---

### Step 9: KeyboardService

**Create `src/services/keyboard-service.ts`**

Global keyboard listener. Resolves key events against ActionRegistry using current focus context. Ignores events from editable elements and during IME composition.

```typescript
import type { ActionRegistry } from "./action-registry"
import type { FocusService } from "./focus-service"

export interface KeyboardServiceConfig {
  actionRegistry: ActionRegistry
  focusService: FocusService
}

export function createKeyboardService(config: KeyboardServiceConfig) {
  const { actionRegistry, focusService } = config
  let attached = false
  let modalScope: string | null = null

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName.toLowerCase()
    if (tag === "input" || tag === "textarea") return true
    if (target.isContentEditable) return true
    return false
  }

  function normalizeKey(e: KeyboardEvent): string {
    const parts: string[] = []
    if (e.altKey) parts.push("Alt")
    if (e.ctrlKey) parts.push("Ctrl")
    if (e.metaKey) parts.push("Meta")
    if (e.shiftKey) parts.push("Shift")
    parts.push(e.key)
    return parts.join("+")
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Ignore IME composition
    if (e.isComposing) return

    // Ignore editable elements unless modal is open
    if (!modalScope && isEditableTarget(e.target)) return

    const key = normalizeKey(e)
    const state = focusService.getState()

    // 1. Modal-local bindings
    if (modalScope) {
      const action = actionRegistry.resolve(key, modalScope)
      if (action) {
        e.preventDefault()
        action.execute({
          selectedItem: undefined,
          focusedSection: modalScope,
        })
        return
      }
    }

    // 2. Tab navigation between sections
    if (e.key === "Tab") {
      e.preventDefault()
      if (e.shiftKey) {
        focusService.focusPrevSection()
      } else {
        focusService.focusNextSection()
      }
      return
    }

    // 3. Arrow navigation within section
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault()
      focusService.moveItem(1)
      return
    }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault()
      focusService.moveItem(-1)
      return
    }

    // 4. Focused-section action bindings
    if (state.activeSectionId) {
      const scope = `${state.activeSectionId}.focused`
      const action = actionRegistry.resolve(key, scope)
      if (action) {
        e.preventDefault()
        action.execute({
          selectedItem: String(state.activeItemIndex),
          focusedSection: state.activeSectionId,
        })
        return
      }
    }

    // 5. Global bindings
    const globalAction = actionRegistry.resolve(key, "global")
    if (globalAction) {
      e.preventDefault()
      globalAction.execute({
        selectedItem: undefined,
        focusedSection: state.activeSectionId ?? undefined,
      })
    }
  }

  function attach() {
    if (attached) return
    document.addEventListener("keydown", handleKeyDown)
    attached = true
  }

  function detach() {
    document.removeEventListener("keydown", handleKeyDown)
    attached = false
  }

  function setModalScope(scope: string | null) {
    modalScope = scope
  }

  return { attach, detach, setModalScope }
}

export type KeyboardService = ReturnType<typeof createKeyboardService>
```

**Tests:**
- Tab dispatches to `focusNextSection`, Shift+Tab to `focusPrevSection`
- Arrow keys dispatch to `moveItem`
- Scoped action keybinding resolves and calls execute
- Editable target events are ignored
- Modal scope takes precedence
- Global fallback bindings work
- `normalizeKey` handles modifier combinations

---

### Step 10: SelectionService

**Create `src/services/selection-service.ts`**

URL-backed selection state for orchestration and phase. Coordinates reads/writes between router and components.

```typescript
export interface SelectionState {
  orchestrationId: string | null
  phaseId: string | null
}

export function createSelectionService() {
  let state: SelectionState = { orchestrationId: null, phaseId: null }
  const listeners: Set<() => void> = new Set()

  function notify() {
    listeners.forEach((fn) => fn())
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function selectOrchestration(id: string | null) {
    if (state.orchestrationId === id) return
    state = { orchestrationId: id, phaseId: null }
    notify()
  }

  function selectPhase(id: string | null) {
    if (state.phaseId === id) return
    state = { ...state, phaseId: id }
    notify()
  }

  function syncFromUrl(params: URLSearchParams) {
    const orch = params.get("orch")
    const phase = params.get("phase")
    const next: SelectionState = {
      orchestrationId: orch,
      phaseId: phase,
    }
    if (next.orchestrationId !== state.orchestrationId || next.phaseId !== state.phaseId) {
      state = next
      notify()
    }
  }

  function toUrlParams(): URLSearchParams {
    const params = new URLSearchParams()
    if (state.orchestrationId) params.set("orch", state.orchestrationId)
    if (state.phaseId) params.set("phase", state.phaseId)
    return params
  }

  function getState(): SelectionState {
    return { ...state }
  }

  return { subscribe, selectOrchestration, selectPhase, syncFromUrl, toUrlParams, getState }
}

export type SelectionService = ReturnType<typeof createSelectionService>
```

**Tests:**
- Select orchestration clears phase
- Select phase preserves orchestration
- `syncFromUrl` parses query params
- `toUrlParams` serializes state
- Listeners called on state change
- No notification on redundant set

---

### Step 11: Service composition + RuntimeProvider

**Create `src/services/index.ts`** — Service barrel exports + factory

```typescript
export { createActionRegistry, type ActionRegistry } from "./action-registry"
export { createFocusService, type FocusService } from "./focus-service"
export { createKeyboardService, type KeyboardService } from "./keyboard-service"
export { createSelectionService, type SelectionService } from "./selection-service"
export { QueryValidationError, NotFoundError, PermissionError, TransientDataError } from "./errors"
```

**Create `src/services/runtime.ts`** — Service instances + context

```typescript
import { createActionRegistry } from "./action-registry"
import { createFocusService } from "./focus-service"
import { createKeyboardService } from "./keyboard-service"
import { createSelectionService } from "./selection-service"

export interface AppServices {
  actionRegistry: ActionRegistry
  focusService: FocusService
  keyboardService: KeyboardService
  selectionService: SelectionService
}

export function createAppServices(): AppServices {
  const actionRegistry = createActionRegistry()
  const focusService = createFocusService()
  const keyboardService = createKeyboardService({ actionRegistry, focusService })
  const selectionService = createSelectionService()
  return { actionRegistry, focusService, keyboardService, selectionService }
}
```

**Create `src/providers/RuntimeProvider.tsx`**

```tsx
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import { createAppServices, type AppServices } from "@/services/runtime"

const ServicesContext = createContext<AppServices | null>(null)

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => createAppServices(), [])

  useEffect(() => {
    services.keyboardService.attach()
    return () => services.keyboardService.detach()
  }, [services])

  return (
    <ServicesContext value={services}>
      {children}
    </ServicesContext>
  )
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error("useServices must be used within RuntimeProvider")
  return services
}
```

**Test:** `RuntimeProvider` renders children. `useServices()` outside provider throws. Services are accessible from a child component.

---

### Step 12: React hooks for services

**Create `src/hooks/useAction.ts`**

```typescript
import { useCallback } from "react"
import { useServices } from "@/providers/RuntimeProvider"
import type { ActionContext } from "@/services/action-registry"

export function useAction(id: string) {
  const { actionRegistry } = useServices()
  const descriptor = actionRegistry.get(id)

  const execute = useCallback(
    (ctx?: Partial<ActionContext>) => {
      const action = actionRegistry.get(id)
      if (action) action.execute({ ...ctx } as ActionContext)
    },
    [actionRegistry, id],
  )

  return { descriptor, execute }
}
```

**Create `src/hooks/useFocusable.ts`**

```typescript
import { useEffect, useSyncExternalStore } from "react"
import { useServices } from "@/providers/RuntimeProvider"

export function useFocusable(sectionId: string, itemCount: number) {
  const { focusService } = useServices()

  useEffect(() => {
    const cleanup = focusService.registerSection(sectionId, itemCount)
    return cleanup
  }, [focusService, sectionId, itemCount])

  useEffect(() => {
    focusService.setItemCount(sectionId, itemCount)
  }, [focusService, sectionId, itemCount])

  const state = useSyncExternalStore(
    focusService.subscribe,
    () => focusService.getState(),
  )

  return {
    isSectionFocused: state.activeSectionId === sectionId,
    activeIndex: state.activeSectionId === sectionId ? state.activeItemIndex : -1,
  }
}
```

**Create `src/hooks/useSelection.ts`**

```typescript
import { useCallback, useSyncExternalStore } from "react"
import { useSearchParams } from "react-router-dom"
import { useServices } from "@/providers/RuntimeProvider"
import { useEffect } from "react"

export function useSelection() {
  const { selectionService } = useServices()
  const [searchParams, setSearchParams] = useSearchParams()

  // Sync URL -> service on URL change
  useEffect(() => {
    selectionService.syncFromUrl(searchParams)
  }, [selectionService, searchParams])

  // Sync service -> URL on service state change
  useEffect(() => {
    return selectionService.subscribe(() => {
      const params = selectionService.toUrlParams()
      setSearchParams(params, { replace: true })
    })
  }, [selectionService, setSearchParams])

  const state = useSyncExternalStore(
    selectionService.subscribe,
    () => selectionService.getState(),
  )

  const selectOrchestration = useCallback(
    (id: string | null) => selectionService.selectOrchestration(id),
    [selectionService],
  )

  const selectPhase = useCallback(
    (id: string | null) => selectionService.selectPhase(id),
    [selectionService],
  )

  return { ...state, selectOrchestration, selectPhase }
}
```

**Tests:**
- `useAction` returns descriptor and executable callback
- `useFocusable` registers section and tracks focus state
- `useSelection` syncs between URL and service

---

### Step 13: DataErrorBoundary component

**Create `src/components/DataErrorBoundary.tsx`**

```tsx
import { Component, type ReactNode, type ErrorInfo } from "react"
import { QueryValidationError, NotFoundError, PermissionError, TransientDataError } from "@/services/errors"

interface Props {
  children: ReactNode
  panelName: string
  fallback?: (error: unknown, reset: () => void) => ReactNode
}

interface State {
  error: unknown | null
}

export class DataErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: unknown): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Structured telemetry (console for now, extensible later)
    console.error(`[${this.props.panelName}] Error boundary caught:`, {
      error,
      componentStack: info.componentStack,
    })
  }

  reset = () => {
    this.setState({ error: null })
  }

  renderFallback(): ReactNode {
    const { error } = this.state
    const { fallback, panelName } = this.props

    if (fallback) return fallback(error, this.reset)

    if (error instanceof QueryValidationError) {
      return (
        <div role="alert" className="p-4 text-destructive">
          <p>Data error in {panelName}: {error.message}</p>
          <button onClick={this.reset}>Retry</button>
        </div>
      )
    }

    if (error instanceof NotFoundError) {
      return (
        <div role="alert" className="p-4 text-muted-foreground">
          <p>{error.resource} not found</p>
        </div>
      )
    }

    if (error instanceof PermissionError) {
      return (
        <div role="alert" className="p-4 text-destructive">
          <p>Access denied: {error.message}</p>
        </div>
      )
    }

    if (error instanceof TransientDataError) {
      return (
        <div role="alert" className="p-4 text-muted-foreground">
          <p>Temporary error loading {panelName}</p>
          <button onClick={this.reset}>Retry</button>
        </div>
      )
    }

    return (
      <div role="alert" className="p-4 text-destructive">
        <p>Unexpected error in {panelName}</p>
        <button onClick={this.reset}>Retry</button>
      </div>
    )
  }

  render() {
    if (this.state.error !== null) return this.renderFallback()
    return this.props.children
  }
}
```

**Tests:**
- Renders children when no error
- Catches `QueryValidationError` and renders retry fallback
- Catches `NotFoundError` and renders empty state
- Reset clears error and re-renders children
- Custom fallback prop is used when provided

---

### Step 14: Update `main.tsx` with RuntimeProvider

**Edit `src/main.tsx`** — Insert `RuntimeProvider` between `ConvexProvider` and `BrowserRouter`:

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ConvexProvider } from "convex/react"
import { convex } from "./convex"
import { RuntimeProvider } from "./providers/RuntimeProvider"
import App from "./App"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <RuntimeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </RuntimeProvider>
    </ConvexProvider>
  </StrictMode>,
)
```

**Test:** App renders without errors (smoke test).

---

### Step 15: Panel compound component

**Create `src/components/Panel.tsx`**

App-level compound component for composing right-panel sections. Uses SCSS module for layout.

```tsx
import { forwardRef, type HTMLAttributes, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export const Panel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col", className)} {...props} />
  ),
)
Panel.displayName = "Panel"

export const PanelHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-3 py-2 font-medium text-sm border-b", className)} {...props} />
  ),
)
PanelHeader.displayName = "PanelHeader"

interface PanelBodyProps extends HTMLAttributes<HTMLDivElement> {
  scrollable?: boolean
}

export const PanelBody = forwardRef<HTMLDivElement, PanelBodyProps>(
  ({ className, scrollable, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex-1", scrollable && "overflow-y-auto", className)}
      {...props}
    />
  ),
)
PanelBody.displayName = "PanelBody"

interface PanelSectionProps extends HTMLAttributes<HTMLDivElement> {
  label: string
}

export const PanelSection = forwardRef<HTMLDivElement, PanelSectionProps>(
  ({ className, label, children, ...props }, ref) => (
    <div ref={ref} className={cn("px-3 py-2", className)} {...props}>
      <div className="text-xs font-medium text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  ),
)
PanelSection.displayName = "PanelSection"
```

**Test:** Each sub-component renders. Panel composes correctly. `scrollable` prop adds overflow class.

---

### Step 16: Barrel exports + verify build

**Create `src/hooks/index.ts`**

```typescript
export { useTypedQuery, type TypedQueryResult } from "./useTypedQuery"
export { useAction } from "./useAction"
export { useFocusable } from "./useFocusable"
export { useSelection } from "./useSelection"
```

**Create `src/services/data/index.ts`**

```typescript
export { decodeOrThrow } from "./decode"
export * from "./queryDefs"
export { toOrchestrationId, toProjectId } from "./id"
export { OrchestrationStatus, PhaseStatus, TaskStatus } from "./status"
```

Verify:
- `npm run typecheck` passes
- `npm run test` passes (all new + existing tests)
- `npm run build` succeeds

---

## File Summary

### New files created:
1. `src/services/errors.ts` — Typed error classes
2. `src/services/data/id.ts` — Convex ID helpers
3. `src/services/data/status.ts` — Status constants
4. `src/services/data/queryDefs.ts` — Query definition registry
5. `src/services/data/decode.ts` — Schema decode boundary
6. `src/services/data/index.ts` — Data barrel
7. `src/services/action-registry.ts` — ActionRegistry
8. `src/services/focus-service.ts` — FocusService
9. `src/services/keyboard-service.ts` — KeyboardService
10. `src/services/selection-service.ts` — SelectionService
11. `src/services/runtime.ts` — Service composition
12. `src/services/index.ts` — Service barrel
13. `src/providers/RuntimeProvider.tsx` — React context provider
14. `src/hooks/useTypedQuery.ts` — Typed Convex query hook
15. `src/hooks/useAction.ts` — Action hook
16. `src/hooks/useFocusable.ts` — Focus section hook
17. `src/hooks/useSelection.ts` — URL-backed selection hook
18. `src/hooks/index.ts` — Hook barrel
19. `src/components/DataErrorBoundary.tsx` — Error boundary
20. `src/components/Panel.tsx` — Panel compound component

### Files modified:
21. `src/main.tsx` — Add RuntimeProvider to provider chain

### Test files created:
22. `src/services/__tests__/errors.test.ts`
23. `src/services/data/__tests__/id.test.ts`
24. `src/services/data/__tests__/status.test.ts`
25. `src/services/data/__tests__/decode.test.ts`
26. `src/services/data/__tests__/queryDefs.test.ts`
27. `src/services/__tests__/action-registry.test.ts`
28. `src/services/__tests__/focus-service.test.ts`
29. `src/services/__tests__/keyboard-service.test.ts`
30. `src/services/__tests__/selection-service.test.ts`
31. `src/providers/__tests__/RuntimeProvider.test.tsx`
32. `src/hooks/__tests__/useAction.test.tsx`
33. `src/hooks/__tests__/useFocusable.test.tsx`
34. `src/hooks/__tests__/useSelection.test.tsx`
35. `src/hooks/__tests__/useTypedQuery.test.ts`
36. `src/components/__tests__/DataErrorBoundary.test.tsx`
37. `src/components/__tests__/Panel.test.tsx`

## Quality Gates

After implementation, all must pass:
- `npm run typecheck` — zero errors
- `npm run test` — all tests green
- `npm run build` — production build succeeds
- Storybook still runs (`npm run storybook`)

## Dependencies on Phase 1

All dependencies satisfied:
- Effect Schemas in `src/schemas/` (used by queryDefs + decode)
- `_tokens.scss` in `src/styles/` (available for Panel SCSS if needed later)
- Vitest + jsdom test config
- `effect` package installed
- `@testing-library/react` + `user-event` installed

## Notes for Executor

- The design specifies Effect-TS Layers/Services pattern, but the implementation uses plain factory functions (createActionRegistry, createFocusService, etc.) composed via React context. This is pragmatic — Effect Layers add complexity without benefit when the composition happens at React provider level. The schemas and typed errors use Effect properly.
- All services return cleanup functions from registration methods for StrictMode compatibility.
- `useSyncExternalStore` bridges service state to React rendering efficiently.
- The `useTypedQuery` hook is intentionally thin over `useQuery` + `decodeOrThrow`. It preserves explicit loading state (not `?? []`).
- Panel compound component uses Tailwind (matching existing primitives) not SCSS modules, since it's a simple layout component. SCSS modules are for complex app layouts in Phase 3+.
