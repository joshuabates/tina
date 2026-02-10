# Design: tina-web Rebuild

## Overview

Rebuild tina-web from the ground up as an IDE-class application for agent orchestration. The current spike code is removed; the existing UI primitive library (18 components with Storybook stories) and design tokens are retained.

Starting with the main orchestration monitoring page, the architecture supports future layouts: project management, agent interaction, embedded neovim/terminal.

This design is Convex-first. Prior SQLite/Axum iterations are treated as historical spikes and are not architectural dependencies for this rebuild.

## Scope & Non-Goals

**In scope (v1 rebuild):**
- New app shell and orchestration page implemented on top of Convex subscriptions
- Effect-based service architecture for keyboard, focus, action dispatch, and runtime schema validation
- End-to-end keyboard navigation model (section focus + item focus + quicklook)
- Storybook-compatible app-level component library composition
- Deterministic component/unit/e2e test strategy and CI gating

**Out of scope (v1 rebuild):**
- Reintroducing a Rust backend layer for tina-web
- SQLite read/write paths
- Embedded terminal/neovim implementation (layout slot only)
- Operator write controls beyond existing action dispatch plumbing
- Mobile-first layout work (desktop experience is primary)

## Constraints & Assumptions

- Convex is the only application datastore for tina-web runtime data.
- Existing `convex/schema.ts` tables are source-of-truth; UI-derived types must validate against runtime payloads.
- Existing UI primitives and design tokens remain stable and are reused, not redesigned.
- React 19 + Router + Convex providers remain the root runtime environment.
- Accessibility and keyboard behavior are product requirements, not optional polish.

## Review Team Synthesis

The plan was reviewed through four architecture lenses:
- **Frontend architecture**: state ownership, routing, composition boundaries, performance budgets
- **Data/contracts**: Convex query coverage, schema decoding boundaries, error taxonomy
- **Interaction systems**: keyboard/focus/action conflict handling, modal precedence, accessibility semantics
- **Quality/release**: test matrix, CI quality gates, phased rollout criteria

The sections below include the resulting decisions and gap closures.

## Success Metrics

- All 7 phases produce a running deliverable
- Every new app-level component has behavior tests (not only snapshot/render tests)
- Playwright e2e tests cover main flows (navigate, select, keyboard nav, quicklook, modal dismissal)
- Data layer is swappable — mock query adapter works in tests without a live Convex deployment
- Keyboard navigation works across all registered focus sections with deterministic precedence rules
- Action registry actions are invokable from keyboard and programmatic callers with the same metadata contract
- Zero `as Type` casting of Convex query payloads in app-level data hooks
- `npm run typecheck`, `npm run test`, and Playwright smoke tests pass in CI for every phase PR

## Technology Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| UI primitives | Existing Tailwind components | Already built, tested, Storybook stories complete |
| App component styling | SCSS modules | Scoped styles, nesting, mixins for complex layouts |
| Service layer | Effect-TS (Layers, Services, Schema) | Typed errors, dependency injection, composable services, swappable adapters |
| Data | Convex via DataService adapter | Real-time subscriptions with a clean testing seam for mock adapters |
| Runtime validation | Effect Schema | Single source of truth for types + runtime validation |
| Loading model | Convex `useQuery` + explicit loading state | Compatible with current `convex/react`; suspense can be added later |
| Error handling | Typed Effect errors + ErrorBoundary | Contextual fallbacks per error type |
| Selection state | URL-backed (router params/query) | Shareable deep links, browser back/forward correctness |
| Local UI state | React local state + service state | Keep ephemeral UI concerns out of URL and Convex |
| Component testing | Vitest | Simple render + behavior tests |
| E2E testing | Playwright | Full page interaction flows |
| Component patterns | Compound/composable | Flexible composition, context-driven children |

## Architecture

### Service Layer (Effect-TS)

Five core services composed via Effect Layers:

**DataService** — query definition registry + decode boundary. Provides `QueryDef` objects pairing Convex API references with Effect Schemas. It does not directly execute hooks (React still does), but it defines canonical decode/error behavior so every hook gets the same runtime validation semantics.

```typescript
class QueryValidationError extends Schema.TaggedError<QueryValidationError>()(
  'QueryValidationError',
  {
    query: Schema.String,
    message: Schema.String,
  },
) {}

// QueryDef pairs a query reference with args and validation schema
const OrchestrationList = QueryDef({
  key: 'orchestrations.list',
  query: api.orchestrations.listOrchestrations,
  args: Schema.Struct({}),
  schema: Schema.Array(Orchestration),
})

const decodeOrThrow = <A>(query: string, schema: Schema.Schema<A>, raw: unknown): A =>
  pipe(
    Schema.decodeUnknownEither(schema)(raw),
    Either.getOrElse((err) => {
      throw new QueryValidationError({
        query,
        message: ParseResult.TreeFormatter.formatErrorSync(err),
      })
    }),
  )

// React hooks execute Convex queries, then delegate decode behavior to DataService policy
function useOrchestrations() {
  const raw = useQuery(OrchestrationList.query, {})
  if (raw === undefined) return []
  return decodeOrThrow(OrchestrationList.key, OrchestrationList.schema, raw)
}

// Test adapters can bypass Convex but still use the same schemas/errors
function useMockOrchestrations() {
  return decodeOrThrow(OrchestrationList.key, OrchestrationList.schema, mockData)
}
```

**ActionRegistry** — named actions with metadata (label, icon, keybinding, context). Actions are plain functions wrapped in descriptors. Components register actions, keyboard/command palette invoke them by ID. Duplicate `(scope, keybinding)` registrations are rejected at startup.

```typescript
registerAction({
  id: 'orchestration.quicklook',
  label: 'Quick Look',
  key: 'Space',
  when: 'sidebar.focused',
  execute: (ctx) => openQuicklook(ctx.selectedItem),
})
```

**KeyboardService** — global keyboard listener. Resolves key events against ActionRegistry using current focus context. Handles modifier keys (alt actions), navigation keys (arrows, tab between sections), and action keys (space for quicklook, enter for select). It ignores events while IME composition is active or when focus is inside editable controls (`input`, `textarea`, `contenteditable`) unless explicitly opted in.

**FocusService** — tracks which section and item is focused. Sections register themselves (`sidebar`, `phaseTimeline`, `taskList`, etc.). Tab moves between sections, arrows move within. Uses roving-tabindex semantics so only one item per section is tab-stop active at a time. Provides the `when` context ActionRegistry uses to resolve keybindings.

**SelectionService** — canonical selection state for orchestration and phase. URL state is the primary source (`?orch=<id>&phase=<id>`), with SelectionService coordinating reads/writes between router and components.

### React Integration

Services are bridged to React via a thin hook layer:

- `RuntimeProvider` — wraps app root, provides Effect Runtime with all Layers composed
- `useService<S>()` — access an Effect service from React
- `useFocusable(sectionId)` — register a focus section, get `isSectionFocused`, `activeIndex`, `setItemCount`
- `useAction(id)` — get action metadata + execute function
- `useTypedQuery(queryDef, args)` — Convex query with shared schema/error policy

Provider order at app root:
1. `ConvexProvider` (remote data context)
2. `RuntimeProvider` (Effect services)
3. `BrowserRouter` (URL as selection source-of-truth)
4. route-level boundaries/layouts

StrictMode double-invocation is explicitly handled: service registration methods (`registerAction`, `registerSection`, keyboard listener attach) must be idempotent and return cleanup functions.

### State Ownership Model

- **URL state (canonical):** selected orchestration, selected phase, currently opened routed panel
- **Convex state (canonical remote):** orchestrations, phases, tasks, team members, events
- **Service state (interaction):** active focus section/item, action availability context
- **Local component state (ephemeral):** transient UI state (quicklook open/closed, panel collapse toggles, hover state)

No duplicated source-of-truth across these layers. URL and Convex states are never mirrored into long-lived local React state.

### Error Boundaries

A `DataErrorBoundary` component wraps panels. It receives typed errors and renders contextual fallbacks. Each panel gets its own boundary so one failure doesn't take down the whole page.

Error taxonomy for v1:
- `QueryValidationError` — schema mismatch from Convex payload; render recoverable error with query key and retry button
- `NotFoundError` — selected orchestration/phase no longer exists; clear selection and show empty-state
- `PermissionError` — auth/access issue; show blocked panel with re-auth guidance
- `TransientDataError` — network/transient failures; show retry affordance with exponential backoff

Boundary fallback contract:
- Never blank the whole page
- Preserve surrounding focus context where possible
- Emit structured telemetry event (`panel_error`, `query_key`, `error_tag`)

### Component Architecture

**Compound components** for app-level composition:

```tsx
<Panel>
  <PanelHeader>Orchestration</PanelHeader>
  <PanelBody scrollable>
    <PanelSection label="Status">...</PanelSection>
    <PanelSection label="Team">...</PanelSection>
  </PanelBody>
</Panel>
```

**Composing primitives** — app components import existing UI primitives (StatusBadge, PhaseCard, TeamMember, etc.) and compose them. Primitives handle visual rendering (Tailwind). App components handle layout, data binding, and keyboard interaction (SCSS modules).

### Styling

- **Primitives**: Tailwind (already built, encapsulated behind component API)
- **App components**: SCSS modules
- **Bridge**: global `_tokens.scss` references existing CSS custom properties

```scss
// _tokens.scss
$bg-primary: var(--background);
$text-primary: var(--foreground);
$accent: var(--primary);
$font-mono: 'JetBrains Mono', monospace;
$sidebar-width: 208px;
$header-height: 44px;
```

Component modules `@use 'tokens'` for shared variables.

## Layout System

### AppShell

Persistent chrome shared across all layouts:

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

- Header: `AppHeader` primitive, search field (future command palette)
- Sidebar: collapsible (208px → 48px icon rail), project/orchestration tree, always navigable
- Footer: `AppStatusBar` primitive, session info, breadcrumb
- Content slot: filled by each page/layout

### Orchestration Page (Main Page)

Fills the content slot with its own grid:

```
┌──────────────────┬───────────────┐
│                  │               │
│  phase timeline  │  right panel  │
│  + task list     │    256px      │
│    flex-1        │               │
│                  │               │
└──────────────────┴───────────────┘
```

Future layouts (project management, agent interaction, terminal) fill the same slot differently.

### Focus Sections (Main Page)

Six focus sections registered for keyboard navigation:

1. **sidebar** — project tree, always present
2. **phaseTimeline** — vertical phase list
3. **taskList** — tasks for active phase
4. **rightPanel.status** — orchestration status
5. **rightPanel.team** — team members
6. **rightPanel.review** — phase review

Tab cycles between sections. Arrows navigate within. Space triggers quicklook. Enter triggers primary action. Alt+key triggers secondary actions.

## Keyboard Navigation & Action System

### Focus Model

- **Tab / Shift+Tab** — cycle focus between sections
- **Arrow keys** — move highlighted item within focused section
- **Space** — quicklook modal for highlighted item
- **Enter** — primary action (open/select)
- **Alt+key** — secondary actions (context-dependent)
- **Escape** — dismiss modal, deselect

### Conflict Resolution Order

Key events resolve in this strict precedence order:
1. Modal-local bindings (if a modal is open)
2. Editable controls (`input`, `textarea`, `contenteditable`) keep native behavior
3. Focused-section action bindings
4. Global app bindings

ActionRegistry enforces strict uniqueness by `(scope, keybinding)`. Same-key collisions at the same scope are rejected during registration.

### Quicklook Modal

Space on any highlightable item opens a lightweight overlay showing a preview. Content determined by item type (orchestration summary, task detail, phase info). Escape or Space again dismisses. Follows the macOS Finder quicklook pattern.

### Action Reuse

All actions registered in ActionRegistry are invokable by:
- Keyboard (via KeyboardService + FocusService context)
- Programmatic call (via `useAction(id)`)
- Future command palette (queries ActionRegistry for available actions)

### Accessibility Contract

- Roving tabindex in each list-like section (`tabindex=0` on active item, `-1` on siblings)
- `aria-activedescendant` for sections with virtual focus
- `role="tree"` / `role="listbox"` semantics where appropriate
- Visible focus ring for section and item focus (distinct styles)
- Quicklook modal uses focus trap and restores prior focus on close

## Data Flow

```
Convex DB
  ↓ (real-time subscriptions)
Convex useQuery  ←── returns `undefined` while loading
  ↓
Effect Schema validation  ←── typed errors on failure
  ↓
DataService hook (useOrchestrations, usePhases, etc.)
  ↓
Component (receives validated, typed data)
```

### Schema Definitions

Effect Schemas replace the current `types.ts` interfaces. They serve double duty — TypeScript types via `Schema.Type<typeof Orchestration>` and runtime validation. Single source of truth.

## Convex Query Contract (v1)

Canonical query coverage for the main page:

| UI Surface | Convex Function | Schema Output | Notes |
|------------|-----------------|---------------|-------|
| Sidebar projects | `api.projects.listProjects` | `ProjectSummary[]` | Name-sorted list with orchestration counts |
| Sidebar orchestrations | `api.orchestrations.listOrchestrations` | `OrchestrationSummary[]` | Includes `nodeName`; sorted by `startedAt` desc |
| Main orchestration view | `api.orchestrations.getOrchestrationDetail` | `OrchestrationDetail` | Includes phases, deduped tasks, team members |
| Right panel review feed | `api.events.listEvents` | `OrchestrationEvent[]` | Queried with `since` cursor; UI filters `phase_review_*` and `git_*` event types |
| Team hierarchy (optional v1.1) | `api.teams.getByTeamName` / `api.teams.listByParent` | `TeamNode[]` | Used when hierarchical team view is enabled |

Query definitions live in one registry module (`src/services/data/queryDefs.ts`) and are the only entry point for app-level data hooks.

### ID Handling Rules

- Route params remain strings at the router boundary.
- Conversion to Convex IDs happens in typed helper functions (never inline `as Id<...>` casts in feature hooks).
- Invalid IDs map to `NotFoundError` with user-visible empty-state, not crashes.

## Auth & Access (UI Contract)

- Read queries used by the rebuild require authenticated operator identity in production environments.
- Action mutations exposed through the UI (`submitAction` and future control actions) are operator-only.
- Node-scoped daemon calls (`pendingActions`, `claimAction`, `completeAction`) are never invoked from browser code.
- Auth failures map to `PermissionError` and panel-level blocked states, not silent nulls.

## Performance & Subscription Strategy

- One Convex subscription per major panel, not per list row.
- Derived computations (grouping/filtering/sorting) are memoized at hook boundaries.
- Virtualization is enabled when list lengths exceed 150 items in sidebar, timeline, or task list.
- Quicklook payload rendering is lazy-loaded by item type to keep initial interaction latency low.
- Performance budget target: `< 1.5s` first meaningful paint on warm local dev start.
- Performance budget target: `< 100ms` keyboard navigation response per keypress in 95th percentile.
- Performance budget target: `< 300ms` quicklook open latency for cached panel data.

## Verification & Quality Gates

Test matrix:

| Layer | Tooling | Required Coverage |
|-------|---------|-------------------|
| Service logic (action/focus/keyboard/selection) | Vitest | Success/failure paths + collision handling |
| Data hooks + schema decoding | Vitest + mock adapter | Decode success, decode failure, transient error paths |
| UI components | Vitest + Testing Library | Keyboard behavior, aria semantics, empty/error states |
| Convex contracts | `convex-test` | Query/mutation shape invariants for functions consumed by UI |
| E2E | Playwright | Navigation, focus cycle, quicklook, route deep-link restore |

CI gates for each phase PR:
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e` (or smoke subset on non-main branches)

## Observability

- Structured client logs for interaction service events (`focus_changed`, `action_invoked`, `key_unhandled`).
- Structured client logs for data errors (`query_key`, `error_tag`, `orchestration_id` when available).
- Optional dev-only diagnostics panel to inspect current focus section, action matches, and keybinding resolution.

## Risk Controls

- Rebuild ships behind a route-level feature gate until Phase 6 parity is complete.
- No formal rollback plan is required for this single-user app; if needed, route gating is sufficient as a lightweight safety valve.

Top risks and mitigations:
- Schema drift between Convex functions and UI expectations: enforced via query registry + Effect Schema decode in every app hook.
- Keyboard conflicts and accidental capture: enforced precedence model + explicit editable-element bypass.
- Loading/error UX regressions: panel-scoped boundaries and required error/empty/loading tests per panel.

## Phasing

### Phase 1: Cleanup & Build Infrastructure
- Remove spike app code (keep UI primitives, storybook, design tokens)
- Set up SCSS modules + Vite config for `.module.scss`
- Global token bridge (`_tokens.scss` referencing CSS custom properties)
- Effect Schema definitions replacing `types.ts`
- Testing infrastructure (Vitest for components, Playwright config, Convex contract tests)
- Add project scripts for quality gates (`typecheck`, `test`, `test:e2e`, `build`)
- **Deliverable: clean project, SCSS working, schemas defined, dev server + storybook running, quality scripts wired**

### Phase 2: Service Layer
- Effect Runtime + Layer composition
- DataService interface + Convex adapter implementation
- ActionRegistry (register, invoke, query actions by context)
- FocusService (section registration, active index tracking)
- KeyboardService (listener, modifier handling, dispatch to ActionRegistry)
- SelectionService (URL-backed orchestration/phase selection state)
- React integration: `RuntimeProvider`, `useService`, `useFocusable`, `useAction`, `useTypedQuery`
- Loading/ErrorBoundary patterns with typed errors
- Service tests — all services testable with mock Layers
- **Deliverable: services working with tests, data flowing through hooks in a minimal test harness**

### Phase 3: AppShell + Sidebar
- `AppShell` grid layout (header, collapsible sidebar, content slot, footer)
- Sidebar with real Convex data — project tree, orchestration list
- URL synchronization (`?orch=<id>&phase=<id>`) for selection deep-links
- Keyboard navigation working end-to-end (arrows in sidebar, tab between sections)
- Collapse toggle + keybinding
- Component tests
- **Deliverable: running app with navigable sidebar, architecture proven**

### Phase 4: Phase Timeline
- Phase timeline with real data for selected orchestration
- Selection flow: sidebar orchestration → timeline populates
- Keyboard navigation within timeline
- Quicklook on phases (space to preview phase detail)
- Component tests
- **Deliverable: selecting an orchestration shows its phases, keyboard navigable**

### Phase 5: Task List
- Task list alongside phase timeline for active phase
- Selecting a phase filters tasks
- Keyboard navigation, quicklook on tasks
- Component tests
- **Deliverable: full center panel working — phases + tasks, interactive**

### Phase 6: Right Panel
- Orchestration status section
- Team panel section
- Git operations section
- Phase review section
- Convex events integration for review feed (`api.events.listEvents`)
- All using Panel compound component, real data
- Component tests
- **Deliverable: full main page matching the mockup, all panels populated**

### Phase 7: Polish & E2E
- Playwright tests covering main flows (navigate, select, keyboard, quicklook)
- Loading/error states refined
- Responsive behavior for panel sizing
- Accessibility pass (aria attributes, screen reader labels)
- Performance budget check and telemetry verification
- Remove route-level feature gate after parity signoff
- **Deliverable: production-ready main page with test coverage and rollout readiness**

## Architectural Context

**Patterns to follow:**
- Primitive compound components (named exports, forwardRef): `tina-web/src/components/ui/card.tsx`
- CVA variant components: `tina-web/src/components/ui/button.tsx`, `tina-web/src/components/ui/status-badge.tsx`
- Domain components (plain function, props interface extends HTMLAttributes): `tina-web/src/components/ui/phase-card.tsx`
- List/composition components (data as `Omit<ChildProps, "className">[]`): `tina-web/src/components/ui/phase-timeline.tsx`
- Storybook story structure (Meta/StoryObj, autodocs tag, category prefixes): `tina-web/src/components/ui/phase-card.stories.tsx`
- Convex client setup with env-based profile selection: `tina-web/src/convex.ts`
- Convex server-side joins via `ctx.db.get()` + `Promise.all`: `convex/orchestrations.ts:55-63`
- Task event deduplication (keep latest per taskId): `convex/tasks.ts:4-15`

**Code to reuse:**
- `tina-web/src/lib/utils.ts` — `cn()` class merging utility (keep for primitives)
- `tina-web/src/convex.ts` — Convex client singleton with profile selection (keep as-is)
- `tina-web/src/index.css` — CSS custom properties (design tokens, referenced by both Tailwind and `_tokens.scss`)
- `tina-web/.storybook/*` — Storybook config, dark theme, story sort order
- All 18 UI primitives in `tina-web/src/components/ui/` — compose, don't modify

**IMPORTANT — Primitive reuse rule:** Before building any new UI component, review the existing primitives in `tina-web/src/components/ui/` AND their `.stories.tsx` files. Stories contain realistic prop values and usage patterns that reveal the intended API contract. If an existing primitive covers the need, compose it — do not rebuild equivalent markup. Check story args carefully for prop naming conventions, expected data formats, and display labels (e.g., `PhaseCard` stories use descriptive `name` values like "Design alignment", not generic "Phase 1"). The primitives handle all visual styling via Tailwind; app components handle layout, data binding, and interaction via SCSS modules.

**Anti-patterns:**
- Don't cast Convex query results with `as Type[]` — use query defs + shared schema decode policy instead (replaces pattern in `tina-web/src/hooks/useOrchestrations.ts:6`)
- Don't collapse loading with `?? []` — preserve explicit loading state and use ErrorBoundary for decode failures (replaces pattern in `tina-web/src/hooks/useOrchestrations.ts:6`)
- Don't hand-write interfaces that mirror Convex schema — derive types from Effect Schemas (replaces `tina-web/src/types.ts`)
- Don't cast route IDs inline (`id as Id<...>`) inside hooks/components — convert in typed ID helpers and fail safely
- Don't register ad-hoc `window.addEventListener('keydown', ...)` in components — all keyboard behavior routes through KeyboardService
- Don't create per-row Convex subscriptions in list render loops — subscribe once at panel boundary

**New dependencies required (Phase 1):**
- `effect` — Effect-TS core (services, layers, schema, typed errors)
- `sass` — SCSS compilation (Vite handles `.module.scss` natively with this installed)
- `vitest` + `@testing-library/react` + `@testing-library/user-event` + `jsdom` — component behavior testing stack in tina-web
- `@playwright/test` (or equivalent Playwright harness package) — stable e2e runner scripts
- No extra Vite plugin needed for SCSS — just `sass` as devDependency

**Convention notes:**
- New app-level panel components follow shadcn-style named exports (`Panel`, `PanelHeader`, `PanelBody`, `PanelSection`) to match existing primitive conventions.
- Storybook story categories: `Foundations/`, `Primitives/`, `Domain/` (existing), plus new `App/` category for app-level components
- Root `vitest.config.ts` is for Convex function tests (edge-runtime). tina-web needs its own `vitest.config.ts` for component tests (browser or jsdom environment).
- `react-router-dom` is already installed — use it for the `<Outlet />` pattern in AppShell even though initial routing is minimal

**Integration:**
- Entry: `tina-web/src/main.tsx` (rewritten with `ConvexProvider` + `RuntimeProvider` + `BrowserRouter`)
- Convex schema unchanged: `convex/schema.ts` — no server-side changes needed
- Convex query surfaces consumed by UI: `convex/orchestrations.ts`, `convex/projects.ts`, `convex/events.ts`, `convex/teams.ts`
- Design reference: `designs/mockups/base-design/screen.png`

## Files Removed (Phase 1)

Current spike app components to remove:
- `src/components/Dashboard.tsx`
- `src/components/OrchestrationDetail.tsx`
- `src/components/OrchestrationList.tsx`
- `src/components/ProjectDetail.tsx`
- `src/components/ProjectOrchestrations.tsx`
- `src/hooks/useOrchestrations.ts`
- `src/hooks/useOrchestrationDetail.ts`
- `src/hooks/useProjectOrchestrations.ts`
- `src/hooks/useProjects.ts`
- `src/App.tsx` (rewritten)
- `src/main.tsx` (rewritten)
- `src/types.ts` (replaced by Effect Schemas)

## Files Retained

- `src/components/ui/*` — all 18 UI primitive components + stories
- `src/docs/*` — Storybook documentation components
- `src/lib/utils.ts` — `cn()` utility
- `src/index.css` — design tokens (CSS custom properties)
- `.storybook/*` — Storybook configuration
- `tailwind.config.ts` — Tailwind theme
- `designs/mockups/base-design/*` — design reference
