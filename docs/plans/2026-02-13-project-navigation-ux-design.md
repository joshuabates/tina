# Tina Web Project Navigation UX Design (Mode-First, Project-Sticky)

Date: 2026-02-13
Status: Validated
Owner: tina-web

## 1. Objective

Replace the current navigation model with a mode-first shell that keeps project context stable while moving between major work surfaces (`Observe`, `Plan`, `Sessions`, `Code`, `Design`).

This directly addresses the current PM trap where selecting a project routes into PM while the sidebar remains orchestration-shaped, making cross-surface movement unclear and brittle.

## 2. Decisions Locked

- Left rail is icon-only and controls top-level mode switching.
- Header contains the global project picker and is the source of truth for current project context.
- Mode switch preserves last subview per mode for the current project.
- Sessions mode defaults to current-project scope.
- Clicking an orchestration always syncs global project context to that orchestration's project.
- The second column/sidebar is mode-specific (not global shared project/orchestration tree).
- App load resumes last `(project, mode, subview)`.
- `sessions`, `code`, and `design` ship visible immediately with explicit empty states.
- No backward compatibility for old PM/query-style routes.
- Any invalid/non-canonical URL redirects to `/`.
- `/projects/:projectId` redirects to that project's last-used mode.
- Delivery is a single implementation phase.

## 3. UX Model

Navigation is a strict 3-layer model:

1. Project context (`Which project am I in?`) -> global header picker.
2. Work mode (`What type of work am I doing?`) -> left icon rail.
3. Mode sub-navigation (`Which object/view inside this mode?`) -> mode-specific sidebar.

This removes ambiguity:

- Rail switches surface type only.
- Project picker switches project only.
- Sidebar switches within-mode views only.

## 4. Route Contract

Canonical routes only:

- `/`
- `/projects/:projectId`
- `/projects/:projectId/observe`
- `/projects/:projectId/plan`
- `/projects/:projectId/sessions`
- `/projects/:projectId/code`
- `/projects/:projectId/design`
- mode-specific detail routes under these bases as needed

Routing rules:

1. `/` restores last `(project, mode, subview)` from persisted nav memory.
2. `/projects/:projectId` redirects to the last-used mode for that project.
3. Any invalid or non-canonical path redirects to `/`.
4. Query-string legacy selection routes are not supported.

Example navigations:

- `/projects/p1/plan/tickets` -> click `Sessions` icon -> `/projects/p1/sessions`
- `/projects/p1/observe?orch=o9` -> click orchestration in `p2` -> route and global project become `/projects/p2/observe?orch=...`

## 5. Mode IA Contract

## Observe

- Sidebar: orchestration list scoped to current project.
- Main: orchestration monitoring page.
- Interaction: orchestration selection updates selected orchestration and project context.

## Plan

- Sidebar: tickets/designs entry points and PM actions.
- Main: project-scoped PM workspace.
- Interaction: tab/list/detail flow remains in Plan mode.

## Sessions

- Sidebar: active sessions for current project plus session creation entry.
- Main: session detail or sessions landing.
- Empty state: "No active sessions for this project" + `Start session` action.

## Code

- Sidebar: workspace/file navigation surface.
- Main: file/editor workspace surface.
- Empty state: "No workspace opened" + `Open project root` action.

## Design

- Sidebar: design workspace/index navigation.
- Main: design workspace/detail surface.
- Empty state: "No design workspace yet" + `Create/Open design` action.

## 6. State Model

URL is canonical for navigation state:

- `projectId`
- `mode`
- `subview`
- selected entity IDs (`orch`, `phase`, `session`, `path`) when applicable

Data sources:

- Convex data: canonical entity existence and metadata.
- Local persisted nav memory: only resume hints, never source of truth.

Introduce shared navigation context service (either extend selection service or add dedicated context service) with responsibilities:

- Read/write canonical navigation state to URL.
- Track and persist:
  - last project
  - last mode per project
  - last subview per `(project, mode)`
- Resolve boot navigation for `/`.
- Enforce orchestration-to-project sync on Observe selection.

Suggested local storage keys:

- `tina.nav.lastProjectId`
- `tina.nav.lastModeByProject`
- `tina.nav.lastSubviewByProjectAndMode`

## 7. Guardrails and Error Behavior

- Invalid/non-canonical URL: redirect to `/`.
- Unknown project ID in canonical route: redirect to `/` (project restored/picked from root flow).
- Missing/deleted detail entity: stay in current mode/project, clear invalid detail param, and return to mode home/list.
- Restored subview no longer valid: fallback order is saved subview -> mode root.
- Route transitions should avoid shell/sidebar flicker by waiting for route-context readiness before rendering mode content.

## 8. Component Responsibilities

## App Shell

- Render header (global project picker), mode rail, mode sidebar slot, main outlet, status bar.
- Own project context binding with router.

## Mode Rail

- Show five icons (`Observe`, `Plan`, `Sessions`, `Code`, `Design`).
- Route to target mode for current project.
- Restore last subview for target mode when available.

## Mode Sidebar Router

- Render correct sidebar component by current mode.
- Keep sidebars independent so each mode can evolve its IA without coupling.

## Root Resolver (`/`)

- Read persisted navigation hints.
- Resolve valid project and mode target.
- Navigate to canonical route.

## 9. Keyboard and Focus Contract

- Mode change resets active focus to the target mode sidebar first actionable item.
- Project switch attempts to preserve focus region (`header`, `rail`, `sidebar`, `main`) where possible.
- Back/forward remains deterministic because URL is canonical state.
- Existing action/focus service behavior remains in place; mode routing feeds context rather than replacing keyboard infrastructure.

## 10. Testing Strategy

Add/adjust tests in web unit/integration + e2e:

- Route behavior:
  - `/` restore behavior
  - `/projects/:projectId` -> project last-mode redirect
  - invalid paths -> `/`
- Context behavior:
  - mode switch keeps project
  - project switch keeps mode shape when valid
  - orchestration click syncs project context
- Mode memory:
  - last subview restore per `(project, mode)`
- Visible empty states:
  - sessions/code/design mode pages render clear CTA states
- Navigation correctness:
  - back/forward across project + mode transitions
  - no dead-end from PM/Plan to other modes

Target files (minimum):

- `tina-web/src/App.tsx`
- `tina-web/src/components/AppShell.tsx`
- `tina-web/src/components/Sidebar.tsx` (or split into mode-specific sidebars)
- `tina-web/src/components/__tests__/PmRoutes.test.tsx`
- `tina-web/e2e/navigation.spec.ts`

## 11. Single-Phase Delivery Scope

One implementation pass includes:

1. Canonical route model and root resolver.
2. Left icon mode rail.
3. Header-owned global project picker integration.
4. Mode-specific second sidebar.
5. Observe/Plan wiring + Sessions/Code/Design visible empty-state pages.
6. URL/state guardrails and persistence memory.
7. Unit/integration/e2e coverage for navigation invariants.

Out of scope for this spec:

- Full terminal embedding implementation details.
- Full file editor/neovim embedding implementation details.
- Deep design-tool feature implementation.

These modes ship as valid navigable surfaces now and can be filled incrementally without changing core IA.

## 12. Acceptance Criteria

- No PM dead-end: users can move from Plan to Observe/Sessions/Code/Design with one rail click.
- Project context remains stable across mode switches unless explicitly changed.
- Observe orchestration selection syncs project context correctly.
- `/` reliably restores last working context.
- Invalid URLs never strand users and always recover via `/`.
- Sessions/Code/Design are visible and understandable via empty-state CTAs.
- Core navigation tests pass for route, state, and back/forward behavior.
