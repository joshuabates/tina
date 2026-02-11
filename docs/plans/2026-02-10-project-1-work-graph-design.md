# Project 1 Design: Work Graph and PM Core (Convex Canonical)

## Status

Validated via brainstorming session on 2026-02-10.

## Objective

Make Tina the canonical PM system for active work with full design/ticket lifecycle in Convex and agent-safe tooling, while preserving orchestration compatibility through helper commands.

## Decisions Locked

- Scope entities: `projects + designs + tickets + comments`
- No `stories` in Project 1
- No historical markdown import; fresh start
- Designs are not versioned in Project 1
- Orchestration handoff is `designId`-based and design-only (tickets not required)
- `/tina:orchestration` must use helper commands (`tina-session`), no direct Convex access
- No automatic design propagation into running orchestration; planner manually pulls latest design before phase planning
- No status gate for orchestrating a design in Project 1
- Human-readable keys plus Convex IDs
- Per-project atomic key counters
- Flat comments only
- No ticket dependency graph in Project 1
- Full PM UI parity for designs and tickets
- Temporary dual orchestration input (`--design-id` and `--design-doc-path`) during migration

## Data Model

## `designs`

Fields:
- `projectId: Id<"projects">`
- `designKey: string` (ex: `TINA-D12`)
- `title: string`
- `markdown: string`
- `status: string` (`draft|in_review|approved|archived`)
- `createdAt: string`
- `updatedAt: string`
- `archivedAt?: string`

Indexes:
- `by_project`
- `by_project_status`
- `by_key`

## `tickets`

Fields:
- `projectId: Id<"projects">`
- `designId?: Id<"designs">`
- `ticketKey: string` (ex: `TINA-142`)
- `title: string`
- `description: string`
- `status: string` (`todo|in_progress|in_review|blocked|done|canceled`)
- `priority: string` (`low|medium|high|urgent`)
- `assignee?: string`
- `estimate?: string`
- `createdAt: string`
- `updatedAt: string`
- `closedAt?: string`

Indexes:
- `by_project`
- `by_project_status`
- `by_design`
- `by_key`
- `by_assignee`

## `workComments`

Fields:
- `projectId: Id<"projects">`
- `targetType: string` (`design|ticket`)
- `targetId: string`
- `authorType: string` (`human|agent`)
- `authorName: string`
- `body: string`
- `createdAt: string`
- `editedAt?: string`

Indexes:
- `by_target`
- `by_project_created`

## `projectCounters`

Fields:
- `projectId: Id<"projects">`
- `counterType: string` (`design|ticket`)
- `nextValue: number`

Indexes:
- `by_project_type` (unique lookup)

Key allocation:
- Design key: `<PROJECT_CODE>-D<nextValue>`
- Ticket key: `<PROJECT_CODE>-<nextValue>`

## API and Helper Contract

All agent and skill access goes through `tina-session work ...`; no direct Convex read/write in skills.

Required commands:
- `tina-session work design create|get|list|update|transition`
- `tina-session work ticket create|get|list|update|transition`
- `tina-session work comment add|list`
- `tina-session work design resolve --design-id <id>`

Command requirements:
- `--json` stable output mode for machine clients
- Structured error envelopes for automation reliability
- Server-side validation for status transitions and key allocation

Orchestration compatibility:
- During migration, orchestration helpers accept both:
  - `--design-id`
  - `--design-doc-path` (temporary compatibility only)
- New and updated skills should use `designId` path.

## Tina-web UX Design

## Selected Wireframe Direction

Chosen direction: `Option B` from interactive mockups.

Reference:
- Design set: `/Users/joshua/Projects/tina/designs/src/designSets/project1-pm-workgraph/index.tsx`
- Route: `/sets/project1-pm-workgraph` (select `Option B`)

Locked UX constraints from selected wireframe:
- Left navigation mirrors Tina-web sidebar grouping (project group -> entity rows)
- Workspace is single-project scoped
- No cross-project list views in primary PM tables
- Only one primary table is visible at once (tickets or designs)
- Right rail provides project context and designId orchestration handoff cues

## Route Additions

- `/pm` backlog landing
- `/pm/designs`
- `/pm/designs/:designId`
- `/pm/tickets`
- `/pm/tickets/:ticketId`

## Required Capabilities

- Design list/detail/create/edit/transition
- Ticket list/detail/create/edit/transition
- Optional link/unlink ticket to design
- Flat comment timeline + create on design/ticket detail
- Project-scoped filtering
- No cross-project primary table views

## UI Conventions (Mandatory)

Project 1 UI must reuse existing Tina-web primitives and patterns.

Required conventions:
- Reuse existing primitives in `/Users/joshua/Projects/tina/tina-web/src/components/ui/`
- Follow app-level composition pattern (`SCSS modules` for app layout + primitive components for visuals)
- Keep `useTypedQuery` + queryDef runtime decode boundary pattern
- Preserve keyboard/focus/action conventions (`FocusService`, roving sections, registered actions)
- Keep error handling via existing typed error + `DataErrorBoundary` pattern
- Match existing route shell and sidebar/app status bar structure

## Delivery Phases

## Phase 1: Schema and Convex Functions

- Add tables/indexes in `convex/schema.ts`
- Add `convex/designs.ts`, `convex/tickets.ts`, `convex/workComments.ts`, `convex/projectCounters.ts`
- Add tests for create/list/update/transition and key allocation

Exit:
- Convex tests pass for all PM entities and transitions.

## Phase 2: `tina-session work` CLI

- Add `work` command family to `tina-session/src/main.rs`
- Implement command handlers and JSON output contracts
- Add integration tests for CLI workflows

Exit:
- Agent can complete end-to-end design/ticket/comment lifecycle using only CLI helpers.

## Phase 3: Tina-web Read and Write PM UI

- Add PM routes and pages in Tina-web
- Implement list/detail/forms for designs and tickets
- Add comment rendering and comment creation
- Ensure existing keyboard and error conventions are preserved

Exit:
- Human can manage designs and tickets entirely from Tina-web.

## Phase 4: Orchestration Handoff Compatibility

- Update helper workflows to resolve design content by `designId`
- Keep temporary file-path compatibility
- Add manual planner pull operation for latest design during phase planning

Exit:
- `/tina:orchestration` works with Convex-backed designs through helper commands.
