# Design: tina-web Rebuild

## Overview

Rebuild tina-web from the ground up as an IDE-class application for agent orchestration. The current spike code is removed; the existing UI primitive library (18 components with Storybook stories) and design tokens are retained.

Starting with the main orchestration monitoring page, the architecture supports future layouts: project management, agent interaction, embedded neovim/terminal.

## Success Metrics

- All 7 phases produce a running deliverable
- Component test coverage for every new component
- Playwright e2e tests covering main page flows (navigate, select, keyboard nav, quicklook)
- Data layer is swappable — mock DataService works in tests without Convex
- Keyboard navigation works across all focusable sections
- Action registry actions are invokable both from keyboard and programmatically

## Technology Decisions

| Concern | Choice | Rationale |
|---------|--------|-----------|
| UI primitives | Existing Tailwind components | Already built, tested, Storybook stories complete |
| App component styling | SCSS modules | Scoped styles, nesting, mixins for complex layouts |
| Service layer | Effect-TS (Layers, Services, Schema) | Typed errors, dependency injection, composable services, swappable adapters |
| Data | Convex via DataService adapter | Real-time subscriptions; adapter allows backend swap |
| Runtime validation | Effect Schema | Single source of truth for types + runtime validation |
| Suspension | React Suspense (native) | Convex handles suspension; Effect validates after data lands |
| Error handling | Typed Effect errors + ErrorBoundary | Contextual fallbacks per error type |
| Component testing | Vitest | Simple render + behavior tests |
| E2E testing | Playwright | Full page interaction flows |
| Component patterns | Compound/composable | Flexible composition, context-driven children |

## Architecture

### Service Layer (Effect-TS)

Four core services composed via Effect Layers:

**DataService** — query definition registry. Provides `QueryDef` objects pairing Convex API references with Effect Schemas. Does NOT execute queries itself — React hooks consume definitions and call `useSuspenseQuery` + `Schema.decodeUnknownSync`. The adapter boundary is at the hook level: Convex hooks for production, mock hooks for tests. Schemas are the shared contract.

```typescript
// QueryDef pairs a query reference with its validation schema
const OrchestrationList = QueryDef({
  query: api.orchestrations.listOrchestrations,
  schema: Schema.Array(Orchestration),
})

// React hooks consume definitions — this is where execution happens
function useOrchestrations() {
  const raw = useSuspenseQuery(OrchestrationList.query)
  return Schema.decodeUnknownSync(OrchestrationList.schema)(raw)
}

// For tests, swap the hook implementation — schemas still validate
function useMockOrchestrations() {
  return Schema.decodeUnknownSync(OrchestrationList.schema)(mockData)
}
```

**ActionRegistry** — named actions with metadata (label, icon, keybinding, context). Actions are plain functions wrapped in descriptors. Components register actions, keyboard/command palette invoke them by name.

```typescript
registerAction({
  id: 'orchestration.quicklook',
  label: 'Quick Look',
  key: 'Space',
  when: 'sidebar.focused',
  execute: (ctx) => openQuicklook(ctx.selectedItem),
})
```

**KeyboardService** — global keyboard listener. Resolves key events against ActionRegistry using current focus context. Handles modifier keys (alt actions), navigation keys (arrows, tab between sections), and action keys (space for quicklook, enter for select).

**FocusService** — tracks which section and item is focused. Sections register themselves (`sidebar`, `phaseTimeline`, `taskList`, etc.). Tab moves between sections, arrows move within. Provides the `when` context that ActionRegistry uses to resolve keybindings.

### React Integration

Services are bridged to React via a thin hook layer:

- `RuntimeProvider` — wraps app root, provides Effect Runtime with all Layers composed
- `useService<S>()` — access an Effect service from React
- `useFocusable(sectionId)` — register a focus section, get `isSectionFocused`, `activeIndex`, `setItemCount`
- `useAction(id)` — get action metadata + execute function
- `useQuery(queryDef)` — Convex suspense query with Effect Schema validation

Convex owns suspension. Effect Schema validates synchronously after data arrives. Validation failures propagate as typed errors to the nearest ErrorBoundary.

### Error Boundaries

A `DataErrorBoundary` component wraps panels. It receives typed Effect errors and renders contextual fallbacks — "no data yet" skeleton vs "something broke" with retry. Each panel gets its own boundary so one failure doesn't take down the whole page.

### Component Architecture

**Compound components** for app-level composition:

```tsx
<Panel>
  <Panel.Header>Orchestration</Panel.Header>
  <Panel.Body scrollable>
    <Panel.Section label="Status">...</Panel.Section>
    <Panel.Section label="Team">...</Panel.Section>
  </Panel.Body>
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

### Quicklook Modal

Space on any highlightable item opens a lightweight overlay showing a preview. Content determined by item type (orchestration summary, task detail, phase info). Escape or Space again dismisses. Follows the macOS Finder quicklook pattern.

### Action Reuse

All actions registered in ActionRegistry are invokable by:
- Keyboard (via KeyboardService + FocusService context)
- Programmatic call (via `useAction(id)`)
- Future command palette (queries ActionRegistry for available actions)

## Data Flow

```
Convex DB
  ↓ (real-time subscriptions)
Convex useQuery / useSuspenseQuery  ←── React Suspense handles loading
  ↓
Effect Schema validation  ←── typed errors on failure
  ↓
DataService hook (useOrchestrations, usePhases, etc.)
  ↓
Component (receives validated, typed data)
```

### Schema Definitions

Effect Schemas replace the current `types.ts` interfaces. They serve double duty — TypeScript types via `Schema.Type<typeof Orchestration>` and runtime validation. Single source of truth.

## Phasing

### Phase 1: Cleanup & Build Infrastructure
- Remove spike app code (keep UI primitives, storybook, design tokens)
- Set up SCSS modules + Vite config for `.module.scss`
- Global token bridge (`_tokens.scss` referencing CSS custom properties)
- Effect Schema definitions replacing `types.ts`
- Testing infrastructure (Vitest for components, Playwright config)
- **Deliverable: clean project, SCSS working, schemas defined, dev server + storybook running, test runner configured**

### Phase 2: Service Layer
- Effect Runtime + Layer composition
- DataService interface + Convex adapter implementation
- ActionRegistry (register, invoke, query actions by context)
- FocusService (section registration, active index tracking)
- KeyboardService (listener, modifier handling, dispatch to ActionRegistry)
- React integration: `RuntimeProvider`, `useService`, `useFocusable`, `useAction`
- Suspense/ErrorBoundary patterns with typed errors
- Service tests — all services testable with mock Layers
- **Deliverable: services working with tests, data flowing through hooks in a minimal test harness**

### Phase 3: AppShell + Sidebar
- `AppShell` grid layout (header, collapsible sidebar, content slot, footer)
- Sidebar with real Convex data — project tree, orchestration list
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
- All using Panel compound component, real data
- Component tests
- **Deliverable: full main page matching the mockup, all panels populated**

### Phase 7: Polish & E2E
- Playwright tests covering main flows (navigate, select, keyboard, quicklook)
- Loading/error states refined
- Responsive behavior for panel sizing
- Accessibility pass (aria attributes, screen reader labels)
- **Deliverable: production-ready main page with test coverage**

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
- Don't cast Convex query results with `as Type[]` — use Effect Schema `decodeUnknownSync` instead (replaces pattern in `tina-web/src/hooks/useOrchestrations.ts:6`)
- Don't collapse loading + null with `?? []` — let Suspense handle loading, let ErrorBoundary handle errors (replaces pattern in `tina-web/src/hooks/useOrchestrations.ts:6`)
- Don't hand-write interfaces that mirror Convex schema — derive types from Effect Schemas (replaces `tina-web/src/types.ts`)

**New dependencies required (Phase 1):**
- `effect` — Effect-TS core (services, layers, schema, typed errors)
- `sass` — SCSS compilation (Vite handles `.module.scss` natively with this installed)
- No extra Vite plugin needed for SCSS — just `sass` as devDependency

**Convention notes:**
- New app-level compound components use dot notation (`Panel.Header`) — distinct from existing primitive compounds which use named exports (`Card`, `CardHeader`). Two conventions coexist intentionally: primitives follow shadcn pattern, app components follow compound pattern.
- Storybook story categories: `Foundations/`, `Primitives/`, `Domain/` (existing), plus new `App/` category for app-level components
- Root `vitest.config.ts` is for Convex function tests (edge-runtime). tina-web needs its own `vitest.config.ts` for component tests (browser or jsdom environment).
- `react-router-dom` is already installed — use it for the `<Outlet />` pattern in AppShell even though initial routing is minimal

**Integration:**
- Entry: `tina-web/src/main.tsx` (rewritten with RuntimeProvider + ConvexProvider + BrowserRouter)
- Convex schema unchanged: `convex/schema.ts` — no server-side changes needed
- Convex queries unchanged: `convex/orchestrations.ts`, `convex/projects.ts`, etc.
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
