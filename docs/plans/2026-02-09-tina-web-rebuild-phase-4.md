# Phase 4: Phase Timeline

## Goal

Replace the `OrchestrationPlaceholder` in the content `<Outlet />` with the real Phase Timeline component. When an orchestration is selected in the sidebar, the center panel shows a vertical timeline of its phases, populated from `OrchestrationDetailQuery`. Phases are selectable, keyboard-navigable, and support quicklook.

## Deliverable

Selecting an orchestration shows its phases in a vertical timeline. Clicking or keyboard-selecting a phase updates the URL (`?phase=<id>`). Space triggers a quicklook modal on the focused phase. The timeline uses real Convex data via `OrchestrationDetailQuery` and the existing `PhaseTimeline`/`PhaseCard` UI primitives.

## Prerequisites (from Phases 2 & 3)

All of these exist and are tested (201 tests passing):
- `AppShell` with collapsible sidebar, header, footer, `<Outlet />`
- `Sidebar` with Convex data, selection, keyboard nav, focus section registered
- `SelectionService` with `selectOrchestration(id)` and `selectPhase(id)`, URL sync (`?orch=&phase=`)
- `OrchestrationDetailQuery` — defined in queryDefs.ts, returns `OrchestrationDetail` with `phases`, `tasks`, `phaseTasks`, `teamMembers`
- `useTypedQuery` — Convex query with Effect Schema decode, returns `TypedQueryResult<A>`
- `useFocusable` — register focus section, get `isSectionFocused`/`activeIndex`
- `useSelection` — URL sync hook with `selectOrchestration`/`selectPhase`
- `useActionRegistration` — register keybinding action with cleanup
- `DataErrorBoundary` — typed error fallbacks per panel
- `normalizeStatus`, `statusColor` — status display helpers
- `toOrchestrationId` — typed ID conversion
- UI primitives: `PhaseTimeline`, `PhaseCard`, `StatusBadge`, `ScrollArea`, `StatPanel`, `MonoText`, `TaskCard`, `TeamPanelUI`/`TeamMember`, `Card`/`CardHeader`/`CardContent`, `Tooltip`

## Data Contract

`OrchestrationDetailQuery` (Convex `getOrchestrationDetail`) returns:

```typescript
{
  _id: string
  featureName: string
  status: string
  totalPhases: number
  currentPhase: number
  phases: Array<{
    _id: string
    orchestrationId: string
    phaseNumber: string       // "1", "2", etc.
    name: Option<string>      // REQUIRES SCHEMA CHANGE — e.g., "AppShell + Sidebar"
    status: string            // "pending", "planning", "executing", "reviewing", "complete", "failed"
    planPath: Option<string>
    gitRange: Option<string>
    planningMins: Option<number>
    executionMins: Option<number>
    reviewMins: Option<number>
    startedAt: Option<string>
    completedAt: Option<string>
  }>
  phaseTasks: Record<string, TaskEvent[]>  // keyed by phaseNumber
  teamMembers: TeamMember[]                // has phaseNumber field
}
```

Key mapping notes:
- `phaseNumber` is a string (e.g., "1", "2") — parse to number for `PhaseCard.phaseNumber`
- Phase `status` values come from Convex as strings; pass to `StatusBadge` after mapping to `StatusBadgeStatus`
- Task counts per phase: count entries in `phaseTasks[phaseNumber]`
- Completed task count per phase: count tasks where `status === "completed"`
- Team count per phase: count `teamMembers` where `phaseNumber` matches
- `PhaseCard.name` — **requires schema change**. The Convex `phases` table currently has no `name` field, but design docs define descriptive phase names (e.g., "Cleanup & Build Infrastructure", "AppShell + Sidebar"). A `name: v.optional(v.string())` field must be added to the Convex schema and the Phase Effect Schema. See Task 2 for the fallback strategy when `name` is absent.

## Implementation Plan

### Task 1: OrchestrationPage component + SCSS module

**Files:**
- `src/components/OrchestrationPage.tsx` (new)
- `src/components/OrchestrationPage.module.scss` (new)
- `src/components/__tests__/OrchestrationPage.test.tsx` (new)

**What:**
Create the main content component that replaces `OrchestrationPlaceholder`. This component:

1. Reads `orchestrationId` from `useSelection()`
2. If no orchestration selected, shows empty state: "Select an orchestration from the sidebar"
3. If selected, calls `useTypedQuery(OrchestrationDetailQuery, { orchestrationId })` with the Convex ID
4. Handles loading, error (throw to DataErrorBoundary), and null (not found) states
5. When data is available, renders the `PhaseTimelinePanel` sub-component
6. Wraps content in `DataErrorBoundary` with `panelName="orchestration"`

The layout follows the mockup center area — the phase timeline fills the left portion of the content area. The right panel is Phase 6 scope (not built here); this component just takes full width of the content slot for now. The scrollable area uses the existing `ScrollArea` primitive (Radix-based) for consistent styled scrollbars.

SCSS module:
```scss
@use '../styles/tokens' as *;

.orchestrationPage {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.header {
  padding: 12px 16px;
  border-bottom: 1px solid $border-color;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-family: $font-display;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  text-transform: uppercase;
}

.subtitle {
  font-size: 11px;
  color: $text-muted;
}

.content {
  flex: 1;
  overflow-y: auto;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: $text-muted;
}
```

**Test (TDD):**
- Renders empty state when no orchestration selected
- Renders loading state while query pending
- Renders phase timeline when data loaded
- Shows orchestration feature name in header
- Throws to error boundary on query error
- Shows not-found state when `OrchestrationDetailQuery` returns null

---

### Task 2: PhaseTimelinePanel component

**Files:**
- `src/components/PhaseTimelinePanel.tsx` (new)
- `src/components/PhaseTimelinePanel.module.scss` (new)
- `src/components/__tests__/PhaseTimelinePanel.test.tsx` (new)

**What:**
Inner component that receives decoded `OrchestrationDetail` and renders the phase timeline. Responsibilities:

1. Maps `OrchestrationDetail.phases` to `PhaseCardProps[]` for the `PhaseTimeline` primitive
2. Derives per-phase data:
   - `phaseNumber`: `parseInt(phase.phaseNumber, 10)`
   - `name`: label based on status/phase number (e.g., "Phase {n}" — keeps it simple and data-driven)
   - `status`: map phase status string to `StatusBadgeStatus` (lowercase match works since `StatusBadge` supports: `complete`, `executing`, `active`, `planning`, `blocked`, `reviewing`, `done`, `pending`, `in_progress`)
   - `taskCount`: `phaseTasks[phase.phaseNumber]?.length ?? 0`
   - `completedCount`: count tasks with `status === "completed"` in `phaseTasks[phase.phaseNumber]`
   - `teamCount`: count `teamMembers` where `phaseNumber === phase.phaseNumber`
3. Registers `phaseTimeline` focus section via `useFocusable` with `phases.length` as item count
4. Adds roving tabindex + `aria-activedescendant` for keyboard navigation
5. Highlights the focused phase item when `isSectionFocused`
6. Calls `selectPhase(phase._id)` on click
7. Highlights the URL-selected phase (from `useSelection().phaseId`)

**Phase name — data gap requiring schema change:**

The Convex `phases` table has no `name` field, but every phase has a descriptive name in the design doc (e.g., "Phase 1: Cleanup & Build Infrastructure", "Phase 3: AppShell + Sidebar"). The `PhaseCard` Storybook stories expect a meaningful `name` prop (e.g., "Design alignment", "Execution"). Currently, phase names are only stored in the plan file titles (via `planPath`), which would require reading the file or parsing the path at display time — not practical from a web frontend.

**Solution**: Add a `name` field to the Convex `phases` table schema and the Phase Effect Schema. This is a minor schema change:
- `convex/schema.ts`: add `name: v.optional(v.string())` to the `phases` table
- `tina-web/src/schemas/phase.ts`: add `name: Schema.optionalWith(Schema.String, { as: "Option" })`
- Backfill: `tina-session` should write phase names when creating/updating phase records (extracted from the design doc phase headings)

For Phase 4 of tina-web-rebuild, use the `name` field if present, fall back to `"Phase {n}"` if absent (to handle older records without the field):

```typescript
function phaseDisplayName(phase: Phase): string {
  if (Option.isSome(phase.name)) return phase.name.value
  return `Phase ${parseInt(phase.phaseNumber, 10) || 0}`
}
```

**Important**: The schema change (Convex table + tina-session writes) is a prerequisite for displaying real phase names. If the schema change hasn't landed by Phase 4 execution, the fallback `"Phase {n}"` will be used. The executor should check whether the field exists and handle both cases.

**Data mapping function (pure, testable):**
```typescript
function mapPhaseToCard(
  phase: Phase,
  phaseTasks: Record<string, TaskEvent[]>,
  teamMembers: TeamMember[],
): PhaseCardProps {
  const phaseNum = parseInt(phase.phaseNumber, 10) || 0
  const tasks = phaseTasks[phase.phaseNumber] ?? []
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const teamCount = teamMembers.filter(m => m.phaseNumber === phase.phaseNumber).length
  const status = phase.status.toLowerCase() as StatusBadgeStatus

  return {
    phaseNumber: phaseNum,
    name: phaseDisplayName(phase),
    status,
    taskCount: tasks.length,
    completedCount,
    teamCount,
  }
}
```

**Component contract:**
```tsx
interface PhaseTimelinePanelProps {
  detail: OrchestrationDetail
}

export function PhaseTimelinePanel({ detail }: PhaseTimelinePanelProps) {
  // useFocusable("phaseTimeline", detail.phases.length)
  // useSelection() for phaseId + selectPhase
  // useActionRegistration for Enter + Space
  // map phases to PhaseCardProps
  // render PhaseTimeline primitive with keyboard/selection overlays
}
```

**Test (TDD):**
- Renders all phases from detail data
- Shows correct task counts per phase
- Shows correct team counts per phase
- Highlights selected phase (matching `phaseId`)
- Click on phase calls `selectPhase`
- Registers `phaseTimeline` focus section with correct item count
- Maps phase status strings to StatusBadge status values
- Handles empty phases array (shows empty timeline state)

---

### Task 3: Keyboard navigation for phase timeline

**Files:**
- `src/components/PhaseTimelinePanel.tsx` (update from Task 2)
- `src/components/__tests__/PhaseTimelinePanel.keyboard.test.tsx` (new)

**What:**
Wire keyboard navigation into the phase timeline:

1. Arrow up/down moves highlighted phase within timeline (via `useFocusable` `activeIndex`)
2. Enter on highlighted phase selects it (`selectPhase(phases[activeIndex]._id)`)
3. Roving tabindex: `tabindex="0"` on active phase, `tabindex="-1"` on siblings
4. `aria-activedescendant` on the timeline container
5. Visible focus ring on highlighted phase item (distinguish from URL-selected highlight)
6. Tab from sidebar to phaseTimeline section works via existing FocusService

Register actions:
```typescript
useActionRegistration({
  id: 'phaseTimeline.select',
  label: 'Select Phase',
  key: 'Enter',
  when: 'phaseTimeline.focused',
  execute: () => selectPhase(phases[activeIndex]._id),
})
```

**Test (TDD):**
- Arrow down moves focus to next phase (activeIndex increments)
- Arrow up moves focus to previous phase
- Enter on focused phase calls `selectPhase`
- Tab from sidebar to phaseTimeline transitions focus section
- Focus ring visible on active phase item
- `aria-activedescendant` updates with focused phase ID
- Roving tabindex correctly set on phase items

---

### Task 4: Quicklook modal for phases

**Files:**
- `src/components/PhaseQuicklook.tsx` (new)
- `src/components/PhaseQuicklook.module.scss` (new)
- `src/components/__tests__/PhaseQuicklook.test.tsx` (new)
- `src/components/PhaseTimelinePanel.tsx` (update)

**What:**
Space on a focused phase opens a lightweight overlay showing phase details. Follows the macOS Finder quicklook pattern.

**Quicklook content (composed from existing UI primitives):**
- Phase number + `StatusBadge` for status display
- `StatPanel` sections for structured info:
  - **Timing**: planning/execution/review durations (from Option fields), displayed with `MonoText`
  - **Plan**: plan path with `MonoText` (if available)
  - **Git**: git range with `MonoText` (if available)
  - **Tasks**: "{completedCount}/{taskCount} tasks complete" summary
  - **Team**: team members for this phase (Note: the `TeamMember` primitive expects `memberStatus: "active"|"busy"|"idle"|"away"` which doesn't map directly from the `TeamMember` schema's fields. For quicklook, show member names and agent types as simple text rather than forcing a status mapping. Use `MonoText` for agent names.)

**Primitives to reuse:**
- `StatusBadge` — phase status
- `StatPanel` — titled section container with header
- `MonoText` — monospace text for paths, git ranges, durations
- `Card`/`CardHeader`/`CardContent` — outer quicklook container (alternatively just a styled div)
- Do NOT use `TeamPanelUI`/`TeamMember` primitive for quicklook — the `memberStatus` field requires active/busy/idle/away which we can't derive from schema data. Just list names.

**Component contract:**
```tsx
interface PhaseQuicklookProps {
  phase: Phase
  tasks: TaskEvent[]
  teamMembers: TeamMember[]
  onClose: () => void
}
```

**Behavior:**
- Space (when phaseTimeline focused) toggles quicklook open/closed
- Escape closes quicklook
- Focus trap inside modal when open
- Restores focus to the phase item on close
- Modal positioned as an overlay centered on the content area

Register action in `PhaseTimelinePanel`:
```typescript
useActionRegistration({
  id: 'phaseTimeline.quicklook',
  label: 'Quick Look',
  key: 'Space',
  when: 'phaseTimeline.focused',
  execute: () => toggleQuicklook(),
})
```

Local state for quicklook:
```typescript
const [quicklookPhaseId, setQuicklookPhaseId] = useState<string | null>(null)
```

**Test (TDD):**
- Space on focused phase opens quicklook
- Quicklook shows phase number and status
- Quicklook shows timing information when available
- Quicklook shows task summary
- Quicklook shows team members
- Escape closes quicklook
- Space again closes quicklook (toggle behavior)
- Focus returns to phase item after close
- Quicklook shows placeholder for missing optional data

---

### Task 5: App.tsx routing update + integration

**Files:**
- `src/App.tsx` (update)
- `src/components/__tests__/App.integration.test.tsx` (update)

**What:**
Replace `OrchestrationPlaceholder` with `OrchestrationPage` in the router:

```tsx
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OrchestrationPage />} />
        <Route path="*" element={<OrchestrationPage />} />
      </Route>
    </Routes>
  )
}
```

Update the integration test to verify the full flow:
1. Load app with `?orch=<id>` in URL
2. Verify phase timeline renders with phases from OrchestrationDetailQuery
3. Click a phase, verify URL updates to `?orch=<id>&phase=<phaseId>`
4. Verify sidebar and timeline selection state are consistent

**Test (TDD):**
- Full integration: sidebar selection populates phase timeline
- URL deep-link `?orch=<id>&phase=<phaseId>` restores both sidebar and timeline selection
- Selecting different orchestration clears phase selection and refreshes timeline
- Phase timeline data matches Convex query response

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `src/components/OrchestrationPage.tsx` | new | Main content component, data fetching + layout |
| `src/components/OrchestrationPage.module.scss` | new | Orchestration page styles |
| `src/components/PhaseTimelinePanel.tsx` | new | Phase timeline with keyboard nav + selection |
| `src/components/PhaseTimelinePanel.module.scss` | new | Timeline panel styles |
| `src/components/PhaseQuicklook.tsx` | new | Phase quicklook modal overlay |
| `src/components/PhaseQuicklook.module.scss` | new | Quicklook modal styles |
| `src/components/__tests__/OrchestrationPage.test.tsx` | new | Data loading, empty, error states |
| `src/components/__tests__/PhaseTimelinePanel.test.tsx` | new | Phase mapping, selection, focus |
| `src/components/__tests__/PhaseTimelinePanel.keyboard.test.tsx` | new | Keyboard navigation tests |
| `src/components/__tests__/PhaseQuicklook.test.tsx` | new | Quicklook behavior tests |
| `src/components/__tests__/App.integration.test.tsx` | update | Full flow integration test |
| `src/App.tsx` | update | Replace placeholder with OrchestrationPage |

## Testing Strategy

All tests use Vitest + Testing Library + jsdom environment (already configured).

**Mocking approach (consistent with Phase 3):**
- `vi.mock("@/hooks/useTypedQuery")` — mock query responses for orchestration detail
- `vi.mock("@/hooks/useFocusable")` — mock focus state
- `vi.mock("@/hooks/useSelection")` — mock selection state
- `vi.mock("@/hooks/useActionRegistration")` — mock action registration
- Router: `MemoryRouter` with `initialEntries` for URL testing

**Test categories:**
1. **Data mapping tests** — `mapPhaseToCard` pure function: correct counts, status mapping
2. **Render tests** — OrchestrationPage empty/loading/error/success states
3. **Selection tests** — Phase click updates URL, URL deep-link highlights phase
4. **Keyboard tests** — Arrow nav, enter select, tab cycling
5. **Quicklook tests** — Space open/close, escape close, content rendering, focus trap
6. **Integration tests** — Full sidebar-to-timeline selection flow

## Execution Order

Tasks should be executed in order: 1 -> 2 -> 3 -> 4 -> 5

Each builds on the previous:
- Task 1: page container with data fetching
- Task 2: timeline rendering with phase data mapping
- Task 3: keyboard navigation on the timeline
- Task 4: quicklook modal for phase detail
- Task 5: routing integration replacing placeholder

## Existing UI Primitives Reference

These Storybook-documented primitives are available and should be composed (not modified) in Phase 4:

| Primitive | File | Props | Use in Phase 4 |
|-----------|------|-------|-----------------|
| `PhaseTimeline` | `ui/phase-timeline.tsx` | `phases: Omit<PhaseCardProps, "className">[]` | Main timeline rendering |
| `PhaseCard` | `ui/phase-card.tsx` | `phaseNumber, name, status, taskCount, completedCount, teamCount` | Individual phase items |
| `StatusBadge` | `ui/status-badge.tsx` | `status: StatusBadgeStatus` (complete/executing/active/planning/blocked/reviewing/done/pending/in_progress) | Phase status in timeline + quicklook |
| `ScrollArea` | `ui/scroll-area.tsx` | Radix ScrollArea wrapper | Scrollable timeline container |
| `StatPanel` | `ui/stat-panel.tsx` | `title, headerAction?, children` | Quicklook info sections |
| `MonoText` | `ui/mono-text.tsx` | `children` | Paths, git ranges, durations in quicklook |
| `Card`/`CardHeader`/`CardContent` | `ui/card.tsx` | Standard compound card | Quicklook outer container |
| `TaskCard` | `ui/task-card.tsx` | `taskId, subject, status, assignee?, duration?, blockedReason?` | Phase 5 scope (not used in quicklook task summary) |
| `TeamPanelUI` | `ui/team-panel.tsx` | `members: { name, memberStatus }[]` | NOT used — `memberStatus` requires active/busy/idle/away mapping unavailable from schema |
| `TeamMember` | `ui/team-member.tsx` | `name, memberStatus: MemberStatus` | NOT used — same `memberStatus` issue |

**Important `PhaseCard` notes from Storybook stories:**
- Stories use descriptive `name` values: "Design alignment", "Plan generation", "Execution", "Phase review", "Wrap-up"
- The `status` prop accepts lowercase strings matching `StatusBadgeStatus` variants
- Phase card renders a circular icon (checkmark for complete, play icon for active, number for future)
- Opacity reduced for `planning`/`pending` status phases
- `PhaseTimeline` adds a vertical connecting line and 8px gap between phases

## Risk Notes

- **phaseNumber as string**: The `Phase` schema has `phaseNumber: Schema.String` (from Convex). Must parse to `number` for `PhaseCard.phaseNumber`. Invalid parse should default to 0, not crash.
- **Null detail response**: `getOrchestrationDetail` can return `null` if the orchestration ID is invalid. The `OrchestrationDetail` Effect Schema is for the non-null case. The component must check for null before decoding and show a not-found state.
- **Status case mapping**: Phase statuses from Convex may be mixed case. Lowercase before passing to `StatusBadge` which expects lowercase variants (`complete`, `executing`, etc.).
- **Focus section ordering**: `phaseTimeline` registers after `sidebar`. Tab order is registration order in `FocusService`. This means Tab from sidebar goes to phaseTimeline, which is the correct behavior.
- **phaseTasks key format**: The `phaseTasks` record is keyed by `phaseNumber` as string (e.g., `"1"`, `"2"`). Must use the same string format when looking up tasks per phase.
- **Quicklook and keyboard conflicts**: Space is registered as `phaseTimeline.focused` scope. When quicklook is open, it should capture Space to close. This requires the quicklook modal to either register its own Space action at modal scope or handle Space in the modal's own keydown handler. The existing KeyboardService precedence model (modal-local > section > global) handles this if the modal registers its own bindings.
- **OrchestrationDetailQuery args**: The query expects `{ orchestrationId: string }` where the string is a Convex ID. Use `toOrchestrationId()` helper for the conversion, but handle the `NotFoundError` it throws when ID is empty/undefined.
- **useTypedQuery with null response**: `getOrchestrationDetail` can return `null`. The current `useTypedQuery` checks `raw === undefined` for loading state, so `null` from Convex passes through to `decodeOrThrow` and fails schema validation (Struct doesn't accept null). **Solution**: Use `Schema.NullOr(OrchestrationDetail)` as the schema in a new query def, or add a `useNullableTypedQuery` variant, or wrap the query def schema as `Schema.Union(Schema.Null, OrchestrationDetail)`. The simplest approach is wrapping: define `OrchestrationDetailQuery` with `schema: Schema.NullOr(OrchestrationDetail)` so the decoded type becomes `OrchestrationDetail | null`, then the component checks for null to show not-found state. This requires updating the existing `OrchestrationDetailQuery` in `queryDefs.ts`.
