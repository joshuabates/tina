# Phase 6: Right Panel

## Context

Phases 2-5 delivered the service layer, app shell with sidebar, orchestration page with phase timeline (280px left column), and task list (flex-1 right column). 295 tests pass across 29 test files. The orchestration page currently has a two-column `centerPanel` grid (`280px 1fr`). Phase 6 adds the right panel as a third column at 256px, matching the mockup layout.

Several UI primitives exist but are unused: `StatPanel`, `TeamPanelUI`, `TeamMember`, `MonoText`, `ScrollArea`. The `Panel`/`PanelHeader`/`PanelBody`/`PanelSection` compound component is already built. The `EventListQuery` query def exists in `queryDefs.ts` but is not yet consumed by any component.

## Deliverables

1. **RightPanel** component with four sections: Orchestration status, Team, Git operations, Phase review
2. **OrchestrationPage** layout updated from 2-column to 3-column grid
3. **Convex events** integration for the review feed via `EventListQuery`
4. **Focus sections** registered for `rightPanel.status`, `rightPanel.team`, `rightPanel.review`
5. **Component tests** for all new components

## Architecture Decisions

- RightPanel receives the full `OrchestrationDetail` prop (same as PhaseTimelinePanel/TaskListPanel) -- avoids duplicate queries
- Events are fetched via a separate `useTypedQuery(EventListQuery, ...)` call inside a `ReviewSection` sub-component, because events are a different query from orchestration detail
- Each section is a pure presentational component composed from existing UI primitives (StatPanel, TeamPanelUI, StatusBadge, MonoText)
- No new services or hooks needed -- reuses `useFocusable`, `useTypedQuery`, `useSelection`, and existing primitives

## File Changes

### Modified Files

**`tina-web/src/components/OrchestrationPage.tsx`**
- Import new `RightPanel` component
- Add `rightPanel` column div alongside `centerPanel`

**`tina-web/src/components/OrchestrationPage.module.scss`**
- Change `.content` layout to include right panel
- Grid becomes: `grid-template-columns: 280px 1fr 256px`
- Add `.rightColumn` class with `overflow-y: auto`, `border-left`

### New Files

**`tina-web/src/components/RightPanel.tsx`** -- Main right panel container
- Receives `OrchestrationDetail` prop
- Composes four sections: `StatusSection`, `TeamSection`, `GitOpsSection`, `ReviewSection`
- Wraps content in `ScrollArea` for vertical overflow
- Registers no focus sections itself (child sections register their own)

**`tina-web/src/components/RightPanel.module.scss`** -- Right panel styles
- Section spacing, section headers, inner layout for each section
- Uses SCSS tokens for colors, fonts, spacing

**`tina-web/src/components/StatusSection.tsx`** -- Orchestration status display
- Shows orchestration status badge (StatusBadge), phase progress (e.g. "Phase 3/5"), elapsed time
- Action buttons: "Design Plan" and "Phase Plan" (links/buttons, visually matching mockup)
- Registers `rightPanel.status` focus section
- Uses `PanelSection` for layout, `StatusBadge` for status, `MonoText` for metadata

**`tina-web/src/components/TeamSection.tsx`** -- Team members display
- Shows team members for the orchestration using `TeamPanelUI` primitive
- Maps `OrchestrationDetail.teamMembers` to `TeamPanelMember[]` (agentName -> name, derive memberStatus from team member data)
- Registers `rightPanel.team` focus section
- Uses `PanelSection` for wrapping

**`tina-web/src/components/GitOpsSection.tsx`** -- Git operations display
- Shows recent commits from events (filtered by `git_*` event types)
- Shows diff summary (file count, additions, deletions) from events
- Uses `MonoText` for commit hashes and diff stats
- Pure presentational, receives events as props

**`tina-web/src/components/ReviewSection.tsx`** -- Phase review feed
- Fetches events via `useTypedQuery(EventListQuery, { orchestrationId })` with `toOrchestrationId` conversion
- Filters for `phase_review_*` event types
- Shows review summary text and "Review and Approve" action area
- Registers `rightPanel.review` focus section
- Handles loading/error states inline (not via error boundary, since parent already has one)

### New Test Files

**`tina-web/src/components/__tests__/RightPanel.test.tsx`**
- Renders all four sections
- Passes orchestration detail data correctly
- Empty state when no data available

**`tina-web/src/components/__tests__/StatusSection.test.tsx`**
- Shows correct status badge for each orchestration status
- Shows phase progress (current/total)
- Shows elapsed time when available
- Registers rightPanel.status focus section

**`tina-web/src/components/__tests__/TeamSection.test.tsx`**
- Renders team members with correct names
- Handles empty team members array
- Maps agent data to memberStatus correctly
- Registers rightPanel.team focus section

**`tina-web/src/components/__tests__/GitOpsSection.test.tsx`**
- Renders recent commits
- Renders diff summary
- Handles empty events (no git operations yet)

**`tina-web/src/components/__tests__/ReviewSection.test.tsx`**
- Shows review events for orchestration
- Filters events by phase_review_* type
- Handles loading state
- Handles empty events state
- Registers rightPanel.review focus section

## Implementation Order (TDD)

Each step follows red-green-refactor:

1. **StatusSection tests + implementation** -- simplest section, pure data display
2. **TeamSection tests + implementation** -- maps detail.teamMembers to TeamPanelUI
3. **GitOpsSection tests + implementation** -- filters events by git_* type
4. **ReviewSection tests + implementation** -- fetches events via useTypedQuery, filters phase_review_*
5. **RightPanel tests + implementation** -- composes all four sections
6. **OrchestrationPage layout update** -- add third column + tests verifying right panel renders

## Data Mapping

### StatusSection
```
detail.status -> StatusBadge status prop (lowercase)
detail.currentPhase / detail.totalPhases -> "Phase 3/5" text
detail.totalElapsedMins -> "44m" elapsed display (Option.getOrElse(() => "--"))
detail.designDocPath -> "Design Plan" button label
```

### TeamSection
```
detail.teamMembers -> TeamPanelUI members prop
  agentName -> name
  memberStatus derived: if most recent phase == current phase -> "active", else "idle"
```

### GitOpsSection
```
events filtered by eventType startsWith "git_" -> recent commits list
  event.summary -> commit message
  event.detail -> commit hash / diff stats (parsed from detail string)
```

### ReviewSection
```
events filtered by eventType startsWith "phase_review" -> review entries
  event.summary -> review text
  event.recordedAt -> timestamp
```

## Testing Strategy

- Mock `useFocusable`, `useSelection`, and `useActionRegistration` hooks (same pattern as PhaseTimelinePanel/TaskListPanel tests)
- Mock `useTypedQuery` for ReviewSection (returns loading/success/error states)
- Use `createMockDetail()` helper pattern established in prior test files
- Test focus section registration (verify useFocusable called with correct section ID)
- Test data rendering (verify correct text/badges appear)
- Test empty/edge states (no team members, no events, etc.)

## Risks

- **Event type strings**: The `eventType` field values (`phase_review_*`, `git_*`) need to match what `tina-session` actually records. If event types differ, the filter predicates will show empty sections. Mitigation: check `convex/events.ts` and existing event data.
- **TeamMember status mapping**: The schema has no explicit "status" field on team members. We derive status from phase number comparison. This is an approximation. Mitigation: document the heuristic, keep it simple (current phase = active, others = idle).
