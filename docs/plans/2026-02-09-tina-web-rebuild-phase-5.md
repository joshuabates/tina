# Phase 5: Task List

## Summary

Add a task list panel alongside the phase timeline in the center content area. Selecting a phase filters the task list. Keyboard navigation and quicklook work on tasks. Uses the existing `TaskCard` primitive and the `phaseTasks` data already available from `OrchestrationDetailQuery`.

## Prerequisites

- Phase 4 complete: PhaseTimelinePanel rendering, phase selection via URL, phase quicklook, keyboard nav in timeline
- 259 tests passing across 26 test files
- `OrchestrationDetailQuery` already returns `phaseTasks` (Record<string, TaskEvent[]>) and `teamMembers`
- `TaskCard` primitive available at `src/components/ui/task-card.tsx`
- `ScrollArea` primitive available at `src/components/ui/scroll-area.tsx`

## Architecture Decisions

**Layout change**: The `OrchestrationPage` content area currently renders only `PhaseTimelinePanel`. Per the mockup, the center panel is a two-column layout: phase timeline (left, narrower) and task list (right, wider). This matches the design:

```
┌──────────────────┬───────────────────────────┐
│  phase timeline  │       task list            │
│    ~280px        │        flex-1              │
│                  │                            │
└──────────────────┴───────────────────────────┘
```

**Data flow**: Task data is already loaded. `OrchestrationDetail.phaseTasks` is keyed by `phaseNumber` string. When a phase is selected (via `useSelection().phaseId`), we look up the phase record to get its `phaseNumber`, then index into `phaseTasks`. No additional Convex queries needed.

**Task quicklook**: Follows the same pattern as `PhaseQuicklook` -- Space on a focused task opens a modal with task details (subject, description, status, owner, blocked-by info). Reuses the same SCSS patterns (backdrop, modal, focus trap).

**Focus section**: Registers `taskList` as a new focus section (design doc lists it as section #3). Tab from phaseTimeline moves to taskList. Arrow keys navigate within task list.

## Deliverables

### 1. TaskListPanel component

**File**: `src/components/TaskListPanel.tsx`
**SCSS**: `src/components/TaskListPanel.module.scss`

Receives the full `OrchestrationDetail` and the selected `phaseId`. Filters tasks to the selected phase. Maps `TaskEvent` schema objects to `TaskCard` props.

Behavior:
- When no phase is selected: show "Select a phase to view tasks" empty state
- When phase is selected but has no tasks: show "No tasks for this phase" empty state
- When phase has tasks: render scrollable list of `TaskCard` components
- Header shows phase number and task count summary (e.g., "Phase 1 - 3/5 tasks complete")

Props:
```typescript
interface TaskListPanelProps {
  detail: OrchestrationDetail
}
```

Internal logic:
- Uses `useSelection()` to get `phaseId`
- Finds the phase record matching `phaseId` from `detail.phases`
- Gets tasks via `detail.phaseTasks[phase.phaseNumber]`
- Maps each `TaskEvent` to `TaskCard` props:
  - `taskId` = `task.taskId`
  - `subject` = `task.subject`
  - `status` = `task.status` (lowercase, cast to `StatusBadgeStatus`)
  - `assignee` = `Option.getOrUndefined(task.owner)`
  - `blockedReason` = `Option.getOrUndefined(task.blockedBy)`

Focus/keyboard:
- `useFocusable("taskList", tasks.length)` registers the section
- `useActionRegistration` for Enter (no-op for now, future: open task detail) and Space (quicklook)
- Roving tabindex on task items (`tabindex=0` on focused, `-1` on siblings)
- `aria-activedescendant` on the list container pointing to focused task
- Each task item gets `id="task-{task._id}"` for accessibility

### 2. TaskQuicklook component

**File**: `src/components/TaskQuicklook.tsx`
**SCSS**: `src/components/TaskQuicklook.module.scss`

Follows the exact same pattern as `PhaseQuicklook`:
- Modal overlay with backdrop click to close
- Focus trap on mount
- Escape and Space dismiss
- Focus restored to previously focused element on close

Content sections:
- **Header**: task subject + status badge
- **Description**: `task.description` if present, else "No description"
- **Details grid**: owner, phase, recorded time
- **Blocked by**: shown only when `task.blockedBy` is Some

Props:
```typescript
interface TaskQuicklookProps {
  task: TaskEvent
  onClose: () => void
}
```

### 3. OrchestrationPage layout update

**File**: `src/components/OrchestrationPage.tsx` (edit existing)
**SCSS**: `src/components/OrchestrationPage.module.scss` (edit existing)

Update the content area to use a two-column grid layout:

```tsx
<div className={styles.content}>
  <div className={styles.centerPanel}>
    <div className={styles.timelineColumn}>
      <PhaseTimelinePanel detail={orchestration} />
    </div>
    <div className={styles.taskColumn}>
      <TaskListPanel detail={orchestration} />
    </div>
  </div>
</div>
```

SCSS additions:
```scss
.centerPanel {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100%;
  overflow: hidden;
}

.timelineColumn {
  overflow-y: auto;
  padding: 16px;
  border-right: 1px solid $border-color;
}

.taskColumn {
  overflow-y: auto;
}
```

### 4. Tests

All tests follow the established pattern: mock hooks, test behavior not implementation.

**File**: `src/components/__tests__/TaskListPanel.test.tsx`

Tests:
- Renders empty state when no phase selected
- Renders empty state when selected phase has no tasks
- Renders task cards for selected phase's tasks
- Shows correct task count summary in header
- Maps TaskEvent status to TaskCard status (lowercase)
- Maps TaskEvent owner to TaskCard assignee
- Maps TaskEvent blockedBy to TaskCard blockedReason
- Registers taskList focus section with correct item count
- Updates item count when phase selection changes

**File**: `src/components/__tests__/TaskListPanel.keyboard.test.tsx`

Tests:
- Registers Space action with "taskList" scope
- Sets tabindex=0 on focused task item
- Sets tabindex=-1 on non-focused task items
- Sets aria-activedescendant to focused task ID
- Does not set aria-activedescendant when section not focused
- Sets unique id on each task item

**File**: `src/components/__tests__/TaskQuicklook.test.tsx`

Tests:
- Renders task subject and status badge
- Renders description when present
- Shows "No description" when description is None
- Shows owner when present
- Shows blocked reason when present
- Calls onClose on Escape key
- Calls onClose on Space key
- Calls onClose on backdrop click
- Focus trap keeps focus within modal
- Modal receives focus on mount
- Has correct aria attributes (role="dialog", aria-modal, aria-labelledby)

**File**: `src/components/__tests__/OrchestrationPage.test.tsx` (edit existing)

Additional test:
- Renders both PhaseTimelinePanel and TaskListPanel when data loaded

## Implementation Order

The executor should follow TDD and implement in this order:

1. **TaskListPanel tests** (both render and keyboard) -- write all tests first, all failing
2. **TaskListPanel component + SCSS** -- make tests pass
3. **TaskQuicklook tests** -- write all tests, all failing
4. **TaskQuicklook component + SCSS** -- make tests pass
5. **Wire into TaskListPanel** -- add quicklook state management to TaskListPanel (same pattern as PhaseTimelinePanel + PhaseQuicklook)
6. **OrchestrationPage layout update** -- two-column grid, import TaskListPanel
7. **Update OrchestrationPage test** -- add test for TaskListPanel presence
8. **Verify all tests pass** -- `npm test` in tina-web

## Files Created

- `tina-web/src/components/TaskListPanel.tsx`
- `tina-web/src/components/TaskListPanel.module.scss`
- `tina-web/src/components/TaskQuicklook.tsx`
- `tina-web/src/components/TaskQuicklook.module.scss`
- `tina-web/src/components/__tests__/TaskListPanel.test.tsx`
- `tina-web/src/components/__tests__/TaskListPanel.keyboard.test.tsx`
- `tina-web/src/components/__tests__/TaskQuicklook.test.tsx`

## Files Modified

- `tina-web/src/components/OrchestrationPage.tsx` -- import TaskListPanel, two-column layout
- `tina-web/src/components/OrchestrationPage.module.scss` -- add centerPanel grid styles
- `tina-web/src/components/__tests__/OrchestrationPage.test.tsx` -- add TaskListPanel presence test

## Risk Notes

- **No new Convex queries**: All task data comes from existing `OrchestrationDetailQuery`. No schema or server-side changes needed.
- **TaskCard primitive is stable**: Uses it as-is, no modifications to the primitive.
- **Focus section ordering**: Adding `taskList` as a new focus section means Tab order expands. The FocusService handles section registration order automatically based on registration time, which matches component mount order (sidebar -> phaseTimeline -> taskList).
- **Option handling**: `TaskEvent` uses `Schema.optionalWith(..., { as: "Option" })`, so fields like `owner`, `description`, `blockedBy` are Effect `Option` types. Use `Option.getOrUndefined()` or `Option.match()` consistently.
