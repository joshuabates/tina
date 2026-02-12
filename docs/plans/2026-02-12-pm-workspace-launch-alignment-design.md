# PM Workspace + Launch UX Realignment Design

## Status

Validated through stakeholder brainstorming on 2026-02-12.

## Objective

Realign PM and orchestration launch UX to the intended wireframes and operator workflow:

- Keep one sidebar model across the app (no PM-specific navigation tree).
- Make project click the primary PM entry action.
- Use one project-scoped PM workspace with a dual-mode table (`Tickets | Designs`).
- Move creation/edit/launch flows to modals, not route pages.
- Remove ticket assignee complexity.
- Make launch design-driven (phases from design, no launch-time phase editing).
- Replace opaque preset-only launch UX with full visible policy configuration.

## Decisions Locked

- PM navigation uses a single global sidebar only.
- No per-project sublinks in sidebar (`tickets`, `designs`, `launch`) and no sidebar mode toggle.
- Clicking a project opens PM for that project.
- PM workspace uses one dual-mode table toggle (`Tickets | Designs`).
- New form flows are modal-only.
- Markdown design import uses prefilled modal behavior (not auto-create).
- No frontmatter metadata for design validation markers.
- Validation markers are design-scoped, not project-default-scoped.
- Complexity is selected manually in design modal.
- Launch node selection is automatic from current runtime context (not user-selected in UI).
- Launch phase count is derived from design content, not configured in launch form.

## Non-Goals

- No integrated terminal or in-page agent brainstorming action in this phase.
- No implementation of advanced marker taxonomy governance outside design records.
- No redesign of orchestration observability surfaces beyond launch entry flow.

## Target UX Model

## Navigation

- Global sidebar remains visible and authoritative for project selection.
- Selecting a project navigates to `/pm?project=<id>`.
- PM no longer introduces a second sidebar model or project entity sub-navigation.

## PM Workspace

- One content shell for the selected project.
- Primary segmented control switches table mode:
  - `Tickets`
  - `Designs`
- Table actions, columns, and row interactions are mode-specific but remain in one stable shell.

## Modal-First Interaction

All new/create/edit workflows are modal interactions from PM workspace context:

- `Create Ticket` modal
- `Create Design` modal
- `Import Markdown` modal path (prefilled design form)
- `Launch Orchestration` modal

Existing route pages may remain temporarily for backward compatibility, but product intent and primary UX are modal-first.

## Data Model and Contracts

## Ticket Simplification

Remove assignee from PM product model and workflows.

- Drop `assignee` from schema, mutations, queries, UI schemas, and forms.
- Remove `assignee` filters/index dependencies.
- Preserve `title`, `description`, `priority`, `status`, optional `design link`, optional `estimate`.

## Design Validation Model (Convex-Native)

Design stores validation state directly in Convex fields; markdown remains plain content.

Required design fields:

- `complexityPreset: "simple" | "standard" | "complex"`
- `requiredMarkers: string[]`
- `completedMarkers: string[]`
- `phaseCount: number`
- `phaseStructureValid: boolean`
- `validationUpdatedAt: string`

Marker semantics:

- `requiredMarkers` are initialized from the chosen complexity preset at design creation/import time.
- `completedMarkers` are user-updated checklist state for that specific design.
- No frontmatter parsing or metadata coupling.

Phase semantics:

- Backend parses markdown for required phase headings (`## Phase N` pattern).
- `phaseCount` and `phaseStructureValid` are computed server-side on create/update.

## Complexity Preset Templates

Preset-to-marker mapping lives in backend constants and is editable through product iteration:

- `simple` => minimal checklist
- `standard` => default checklist
- `complex` => extended checklist

Mapping is used only to initialize a design's `requiredMarkers` snapshot.

## Launch Behavior and Validation

Launch inputs:

- `projectId`
- `designId`
- optional `ticketIds`
- explicit full policy configuration payload

Launch removed inputs:

- no `node` picker in UI
- no `totalPhases` input in UI

Launch gate conditions (hard failures):

1. Missing validation markers:
   - `requiredMarkers - completedMarkers` must be empty.
2. Invalid phase structure:
   - `phaseStructureValid` must be `true`.
   - `phaseCount >= 1`.

Derived launch fields:

- `totalPhases` is always derived from `design.phaseCount`.
- `nodeId` is resolved automatically from current runtime context and persisted on orchestration record.

Node UX contract:

- Node is an internal execution transport concern, not user-facing launch configuration.
- If runtime node resolution fails, launch returns actionable infrastructure error.

## Policy Configuration UX

Launch modal must expose full policy settings:

- model policy fields (all roles)
- review policy fields (all enforceable toggles/options)

Preset behavior:

- Preset buttons are optional accelerators that prefill form state.
- Final launch payload is always explicit full policy config, not hidden preset-only semantics.

## Workflow Details

## Markdown Import (Prefill Path)

1. User drags markdown file into PM workspace or uses import action.
2. System opens `Create Design` modal prefilled with:
   - `title` (derived from first heading or filename)
   - `markdown` full content
3. User selects complexity preset manually.
4. System seeds `requiredMarkers` from preset.
5. User marks checklist items in modal (`completedMarkers`).
6. Save persists design and computed phase validation metadata.

## Project Click -> PM

1. User clicks project in global sidebar.
2. App navigates to `/pm?project=<id>`.
3. PM workspace opens with default table mode (Tickets).
4. User can toggle to Designs without changing route hierarchy.

## Delivery Plan

## Phase 1: Navigation and Workspace Shell

- Remove PM-specific sidebar model and sublinks.
- Route project click to project-scoped PM workspace.
- Introduce unified PM table shell with `Tickets | Designs` toggle.

## Phase 2: Modalization

- Move create/edit flows for tickets/designs into modals.
- Introduce launch modal entry from workspace.
- Keep temporary compatibility routes if needed.

## Phase 3: Ticket Model Cleanup

- Remove assignee end-to-end (schema/API/UI/tests).
- Update list/detail/create/edit contracts and filters.

## Phase 4: Design Validation Model

- Add complexity + marker fields + phase validation fields to designs.
- Implement backend phase parsing and marker persistence.
- Add markdown import prefill UX.

## Phase 5: Launch Rewrite

- Remove node/phase manual inputs.
- Add automatic runtime node resolution.
- Enforce launch hard gates from design validation state.
- Expose full policy configuration editor in modal.

## Testing Strategy

## Unit

- Design markdown phase parser and heading validator.
- Complexity preset marker seeding.
- Marker-difference gate computation.
- Launch payload builder with derived `totalPhases`.

## Integration (Convex)

- Create/update design computes `phaseCount` + `phaseStructureValid`.
- Launch rejects when markers incomplete.
- Launch rejects when phase structure invalid.
- Launch succeeds when validation complete and persists derived phases.
- Launch node resolution success/failure paths.

## Web Component/Route

- Global sidebar project click navigates to `/pm?project=<id>`.
- PM shows one workspace, no duplicate sidebar navigation.
- Modal flows open/close and save correctly.
- Markdown import prefill behavior.
- Launch modal shows full policy fields and clear validation errors.

## Acceptance Criteria

- PM experience is project-centric, table-dual-mode, and modal-first.
- No user-facing node selector in launch.
- No user-configurable launch phase count.
- Ticket assignee is removed from product workflow and data contract.
- Designs carry their own validation model without frontmatter.
- Launch cannot proceed unless design markers and phase structure are valid.
- Policy configuration is transparent and fully editable in UI.
