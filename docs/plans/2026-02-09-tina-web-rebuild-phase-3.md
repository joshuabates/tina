# Phase 3: AppShell + Sidebar

## Goal

Build the persistent app chrome (header, collapsible sidebar, content slot, footer) with real Convex data in the sidebar, URL-backed selection, and end-to-end keyboard navigation. This is where the architecture from Phase 2 gets proven in a running app.

## Deliverable

Running app with navigable sidebar showing real projects and orchestrations from Convex, URL deep-links for selection state, and keyboard navigation (arrows within sidebar, tab between sections).

## Prerequisites (from Phase 2)

All of these exist and are tested:
- `RuntimeProvider` / `useServices()` — context for all services
- `FocusService` — section registration, item navigation, tab cycling
- `KeyboardService` — global listener, action resolution, modifier handling
- `SelectionService` — URL-backed orchestration/phase selection
- `ActionRegistry` — action registration with keybinding conflict detection
- `useTypedQuery` — Convex queries with Effect Schema decode
- `useFocusable` — register focus section, get `isSectionFocused`/`activeIndex`
- `useSelection` — URL <-> SelectionService sync
- `DataErrorBoundary` — typed error fallbacks per panel
- `Panel`/`PanelHeader`/`PanelBody`/`PanelSection` — compound layout components
- `_tokens.scss` — SCSS bridge to CSS custom properties
- Existing UI primitives: `AppHeader`, `AppStatusBar`, `SidebarNav`, `SidebarItem`

## Status Value Comparison

Phase 2 review noted that `data/status.ts` uses lowercase values (e.g., `"planning"`, `"executing"`) while Convex stores capitalized values (e.g., `"Planning"`, `"Executing"`). The schema field for `status` is `Schema.String` so decoding won't fail, but display logic and comparisons must be case-insensitive or normalize. This phase will add a `normalizeStatus` utility and use it in sidebar status display.

## Implementation Plan

### Task 1: AppShell layout component + SCSS module

**Files:**
- `src/components/AppShell.tsx` (new)
- `src/components/AppShell.module.scss` (new)

**What:**
Create the persistent app chrome as a CSS Grid layout matching the design spec:

```
┌─────────────────────────────────────────────┐
│                   header                     │  44px
├──────────┬──────────────────────────────────┤
│          │                                   │
│ sidebar  │         <Outlet />                │
│  208px   │    (page-specific content)        │
│ collaps. │                                   │
├──────────┴──────────────────────────────────┤
│                   footer                     │  44px
└─────────────────────────────────────────────┘
```

SCSS module uses token variables (`$sidebar-width`, `$header-height`, etc.) from `_tokens.scss`.

The sidebar has a `collapsed` boolean state (local `useState`) toggling between `208px` and `48px`. A CSS transition animates the change. The `<Outlet />` slot uses `react-router-dom` for page-specific content.

**Component contract:**
```tsx
export function AppShell() {
  // local state: collapsed
  // renders: AppHeader, Sidebar, Outlet, AppStatusBar
  // grid layout via SCSS module
}
```

**Test (TDD):**
- Renders header, sidebar, content outlet, and footer
- Sidebar collapse toggles width
- `role="navigation"` on sidebar, `role="main"` on content area
- Passes `aria-label` for landmark regions

---

### Task 2: Sidebar component with Convex data

**Files:**
- `src/components/Sidebar.tsx` (new)
- `src/components/Sidebar.module.scss` (new)

**What:**
Sidebar component that:
1. Fetches projects via `useTypedQuery(ProjectListQuery, {})`
2. Fetches orchestrations via `useTypedQuery(OrchestrationListQuery, {})`
3. Groups orchestrations under their project (by `projectId`)
4. Renders project tree using existing `SidebarNav`/`SidebarItem` primitives
5. Shows orchestration status text (normalized for display)
6. Highlights selected orchestration based on `useSelection()` state
7. Registers `sidebar` focus section via `useFocusable`
8. Uses `DataErrorBoundary` for error isolation

Collapsed mode shows only an icon rail (48px width). In collapsed mode, project names and orchestration labels are hidden; only status indicators remain.

**Data mapping:**
- Projects sorted by name (already sorted from Convex query)
- Orchestrations grouped by projectId, with ungrouped orchestrations shown under an "Ungrouped" section
- Each orchestration item: `label=featureName`, `statusText=status` (normalized), `statusColor` based on status
- `active` prop set when `orchestrationId === selection.orchestrationId`

**Status normalization utility:**
```typescript
// src/services/data/status.ts (add to existing file)
export function normalizeStatus(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

export function statusColor(status: string): string {
  const normalized = status.toLowerCase()
  switch (normalized) {
    case 'executing': return 'text-status-active'
    case 'complete': return 'text-status-complete'
    case 'blocked': return 'text-status-blocked'
    case 'reviewing': return 'text-status-review'
    default: return 'text-muted-foreground'
  }
}
```

**Test (TDD):**
- Renders loading state while queries are pending
- Renders project tree with orchestrations grouped by project
- Highlights selected orchestration
- Click on orchestration calls `selectOrchestration`
- Shows normalized status text
- Renders empty state when no orchestrations exist
- Registers focus section with correct item count

---

### Task 3: URL synchronization + selection flow

**Files:**
- `src/components/Sidebar.tsx` (update from Task 2)
- `src/App.tsx` (rewrite)

**What:**
Wire up the full selection flow:
1. Click orchestration in sidebar -> `selectOrchestration(id)` -> URL updates to `?orch=<id>`
2. Direct URL load `?orch=<id>` -> SelectionService syncs -> sidebar highlights correct item
3. Selecting a different orchestration clears phase selection
4. Browser back/forward preserves selection state

Rewrite `App.tsx` to use `AppShell` as a layout route with `<Outlet />`:

```tsx
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OrchestrationPlaceholder />} />
        <Route path="*" element={<OrchestrationPlaceholder />} />
      </Route>
    </Routes>
  )
}
```

`OrchestrationPlaceholder` is a temporary component showing either "Select an orchestration" or the selected orchestration's feature name. This placeholder will be replaced by the real orchestration page in Phase 4.

**Test (TDD):**
- URL `?orch=abc123` highlights matching sidebar item
- Clicking sidebar item updates URL
- Browser back restores previous selection
- Invalid/missing orch ID shows empty state (no crash)

---

### Task 4: Keyboard navigation end-to-end

**Files:**
- `src/components/Sidebar.tsx` (update)
- `src/components/AppShell.tsx` (update)

**What:**
Wire keyboard navigation through the sidebar:
1. Arrow up/down moves highlighted item within sidebar list
2. Tab moves focus from sidebar to content area (registered as a second focus section)
3. Enter on highlighted orchestration selects it (via `selectOrchestration`)
4. Roving tabindex: `tabindex="0"` on active item, `tabindex="-1"` on siblings
5. `aria-activedescendant` on the sidebar list container
6. Visible focus ring on highlighted item

Register a sidebar collapse toggle action:
```typescript
registerAction({
  id: 'sidebar.toggle',
  label: 'Toggle Sidebar',
  key: 'Alt+b',
  when: 'global',
  execute: () => toggleCollapsed(),
})
```

Register sidebar Enter action:
```typescript
registerAction({
  id: 'sidebar.select',
  label: 'Select Orchestration',
  key: 'Enter',
  when: 'sidebar.focused',
  execute: (ctx) => selectOrchestration(items[Number(ctx.selectedItem)]._id),
})
```

**Test (TDD):**
- Arrow down moves focus to next sidebar item (activeIndex increments)
- Arrow up moves focus to previous item
- Enter on focused item calls selectOrchestration
- Tab moves focus to next section
- Shift+Tab moves focus to previous section
- Focus ring visible on active item
- `aria-activedescendant` updates with focused item ID
- Alt+b toggles sidebar collapse

---

### Task 5: Sidebar collapse toggle + keybinding

This is handled as part of Task 4. The collapse state lives in `AppShell` and is passed to `Sidebar` as a prop. The `Alt+b` global action is registered in `AppShell` using `useAction` or direct `actionRegistry.register` in an effect.

---

### Task 6: Footer + header integration

**Files:**
- `src/components/AppShell.tsx` (update)

**What:**
Wire real data into AppHeader and AppStatusBar:
- `AppHeader`: title="ORCHESTRATOR", version from package.json or environment
- `AppStatusBar`: `connected` from Convex connection state (can use a simple boolean initially), `projectName` and `phaseName` from selection context

The footer breadcrumb shows: `{projectName} / {featureName} / P{currentPhase} {status}` when an orchestration is selected.

**Test (TDD):**
- Header renders title
- Footer shows "Connected" when no selection
- Footer shows project/feature breadcrumb when orchestration selected
- Footer shows disconnected state (future: Convex connection monitoring)

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/AppShell.tsx` | new | Grid layout with header, sidebar, outlet, footer |
| `src/components/AppShell.module.scss` | new | SCSS module for grid layout |
| `src/components/Sidebar.tsx` | new | Sidebar with Convex data, focus, selection |
| `src/components/Sidebar.module.scss` | new | SCSS module for sidebar styles |
| `src/components/__tests__/AppShell.test.tsx` | new | AppShell layout + collapse tests |
| `src/components/__tests__/Sidebar.test.tsx` | new | Sidebar data, selection, keyboard tests |
| `src/App.tsx` | rewrite | Route layout with AppShell + Outlet |
| `src/services/data/status.ts` | update | Add `normalizeStatus`, `statusColor` helpers |
| `src/services/data/__tests__/status.test.ts` | update | Tests for new status utilities |

## Testing Strategy

All tests use Vitest + Testing Library + jsdom environment (already configured).

**Mocking approach:**
- Convex queries: mock `useQuery` from `convex/react` to return test data
- Services: use real service instances (they're plain functions, not heavy deps)
- Router: wrap tests in `MemoryRouter` with `initialEntries` for URL testing

**Test categories:**
1. **Layout tests** — AppShell renders correct grid structure, landmarks, responsive collapse
2. **Data tests** — Sidebar shows projects/orchestrations from mocked query results
3. **Selection tests** — URL sync, click selection, keyboard selection
4. **Keyboard tests** — Arrow navigation, tab cycling, enter activation, alt+b toggle
5. **Accessibility tests** — ARIA roles, roving tabindex, activedescendant, focus rings
6. **Error tests** — DataErrorBoundary catches decode failures, shows panel-specific fallback
7. **Empty state tests** — No projects, no orchestrations, loading states

## Execution Order

Tasks should be executed in order (1 -> 2 -> 3 -> 4 -> 6) because each builds on the previous. Task 5 is merged into Task 4.

## Risk Notes

- **Status case mismatch**: Convex stores "Planning"/"Executing"/etc. while status.ts has lowercase. The `normalizeStatus` function handles display; comparisons should use `.toLowerCase()`.
- **Orchestrations without projectId**: Some orchestrations may not have a projectId (it's optional in the schema). These should appear in an "Ungrouped" section in the sidebar.
- **Focus registration timing**: `useFocusable` registration happens in useEffect. Item count updates must not race with registration. The existing FocusService handles this via `setItemCount` checking if section exists.
- **StrictMode double-mount**: All action registrations return cleanup functions and are idempotent. AppShell's keyboard attach/detach is already handled by RuntimeProvider.
