# Agent Console Phase 3: Contextual Launch Points

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 6b5462460d72779b6dc71dfce250f26f6afae2db

**Goal:** Add contextual launch buttons throughout tina-web that create ad-hoc terminal sessions pre-seeded with context, or connect to existing orchestration agent panes. "Connect" and "Connect to Lead" navigate to existing panes. "Discuss", "Refine Plan", "Discuss Design", and "Review Commit" create new ad-hoc sessions via `POST /sessions` with context fields, then navigate to the terminal view.

**Architecture:** Phases 1 and 2 delivered the daemon WebSocket relay, Convex schema (`terminalSessions`, `listTerminalTargets`, `teamMembers.tmuxPaneId`), and the frontend terminal view (`TerminalView`, `useTerminal`, `SessionsModePage`, `NewSessionDialog`). This phase adds one-click contextual buttons to existing UI components that either connect to existing tmux panes or create context-seeded sessions.

**Key patterns:**
- `useCreateSession` hook for shared session-creation + navigation logic
- `buildModePath(projectId, "sessions")` + `?pane=` for cross-mode navigation
- `DAEMON_BASE` from `@/lib/daemon` for daemon HTTP calls
- `optionalString` from `@/schemas/common` for new optional schema fields
- `Option.getOrUndefined()` for reading optional fields
- Design says "One click — no intermediate dialogs" for contextual buttons

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 600 |

---

### Task 1: Add `tmuxPaneId` to TeamMember schema

**Files:**
- `tina-web/src/schemas/team.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

The Convex `teamMembers` table already has `tmuxPaneId` (added in Phase 1), and `getOrchestrationDetail` returns it. The tina-web `TeamMember` schema needs the field so it's available in the `OrchestrationDetail` type.

**Steps:**

1. Add `tmuxPaneId` as an optional string field to the TeamMember schema in `tina-web/src/schemas/team.ts`:

Add after line 10 (`joinedAt: optionalString,`):
```typescript
  tmuxPaneId: optionalString,
```

2. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors. The field is optional so all existing code continues to work.

---

### Task 2: Create `useCreateSession` hook

**Files:**
- `tina-web/src/hooks/useCreateSession.ts` (new)

**Model:** opus

**review:** full

**Depends on:** none

Create a shared hook that provides two functions:
- `createAndConnect(options)` — POSTs to `POST /sessions` with context fields, then navigates to the sessions mode page with the new pane ID
- `connectToPane(paneId)` — navigates to the sessions mode page with an existing pane ID

Both functions need `projectId` from route params and `navigate` from react-router.

**Steps:**

1. Create `tina-web/src/hooks/useCreateSession.ts`:

```typescript
import { useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { DAEMON_BASE } from "@/lib/daemon"
import { buildModePath } from "@/lib/navigation"

interface CreateSessionOptions {
  label: string
  cli?: "claude" | "codex"
  contextType?: "task" | "plan" | "commit" | "design" | "freeform"
  contextId?: string
  contextSummary?: string
}

interface CreateSessionResponse {
  sessionName: string
  tmuxPaneId: string
}

export function useCreateSession() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const connectToPane = useCallback(
    (paneId: string) => {
      if (!projectId) return
      const base = buildModePath(projectId, "sessions")
      navigate(`${base}?pane=${encodeURIComponent(paneId)}`)
    },
    [projectId, navigate],
  )

  const createAndConnect = useCallback(
    async (options: CreateSessionOptions) => {
      if (!projectId) return

      const resp = await fetch(`${DAEMON_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: options.label,
          cli: options.cli ?? "claude",
          contextType: options.contextType,
          contextId: options.contextId,
          contextSummary: options.contextSummary,
        }),
      })

      if (!resp.ok) {
        throw new Error(`Failed to create session: ${resp.status}`)
      }

      const data = (await resp.json()) as CreateSessionResponse
      connectToPane(data.tmuxPaneId)
    },
    [projectId, connectToPane],
  )

  return { createAndConnect, connectToPane }
}
```

2. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

### Task 3: Add "Connect" button to team member rows

**Files:**
- `tina-web/src/components/TeamSection.tsx`
- `tina-web/src/components/ui/team-panel.tsx`
- `tina-web/src/components/ui/team-member.tsx`

**Model:** opus

**review:** full

**Depends on:** 1, 2

Add a "Connect" button to each team member row that has a `tmuxPaneId`. Clicking navigates to the terminal view connected to that agent's existing tmux pane. No new session is created.

**Steps:**

1. Update `TeamSection.tsx` to pass `tmuxPaneId` and an `onConnect` callback through the team panel hierarchy.

In `mapTeamMember`, add `tmuxPaneId` extraction:

Replace the `mapTeamMember` function (lines 16-25) with:
```typescript
function mapTeamMember(
  member: OrchestrationTeamMember,
  activePhase: number,
): { name: string; memberStatus: MemberStatus; tmuxPaneId?: string } {
  const memberPhaseNum = Number(member.phaseNumber)
  const memberStatus: MemberStatus = memberPhaseNum === activePhase ? "active" : "idle"
  const tmuxPaneId = Option.getOrUndefined(member.tmuxPaneId)

  return { name: member.agentName, memberStatus, tmuxPaneId }
}
```

In the `TeamSection` component, add the `useCreateSession` hook and pass `onConnect` to TeamPanelUI:

Add import at top:
```typescript
import { useCreateSession } from "@/hooks/useCreateSession"
```

Inside `TeamSection` function body (after `useFocusable` call), add:
```typescript
  const { connectToPane } = useCreateSession()
```

Update both `<TeamPanelUI>` usages to pass `onConnect`:
```tsx
<TeamPanelUI
  title="Orchestration Team"
  members={orchestrationMembers}
  emptyMessage="No team members"
  onConnect={connectToPane}
/>

<TeamPanelUI
  title="Selected Phase"
  members={selectedPhaseMembers}
  emptyMessage={...}
  onConnect={connectToPane}
/>
```

2. Update `team-panel.tsx` to accept and forward `onConnect`:

Update the `TeamPanelMember` interface:
```typescript
interface TeamPanelMember {
  name: string;
  memberStatus: MemberStatus;
  tmuxPaneId?: string;
}
```

Update `TeamPanelProps`:
```typescript
interface TeamPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  members: TeamPanelMember[];
  emptyMessage: string
  onConnect?: (paneId: string) => void
}
```

Update the function signature and member rendering:
```typescript
function TeamPanel({ title, members, emptyMessage, onConnect, className, ...props }: TeamPanelProps) {
```

Update the member map to pass onConnect:
```tsx
members.map((member) => (
  <TeamMember
    key={member.name}
    name={member.name}
    memberStatus={member.memberStatus}
    onConnect={member.tmuxPaneId && onConnect ? () => onConnect(member.tmuxPaneId!) : undefined}
  />
))
```

3. Update `team-member.tsx` to show a "Connect" button when `onConnect` is provided:

Update the `TeamMemberProps` interface:
```typescript
interface TeamMemberProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  memberStatus: MemberStatus;
  onConnect?: () => void;
}
```

Update the component to accept and render the connect button:
```typescript
function TeamMember({
  name,
  memberStatus,
  onConnect,
  className,
  ...props
}: TeamMemberProps) {
  const isInactive = memberStatus === "away" || memberStatus === "shutdown";

  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            dotColorMap[memberStatus],
            memberStatus === "shutdown" && "opacity-20"
          )}
        />
        <span
          className={cn(
            "text-xs font-medium",
            isInactive && "opacity-50"
          )}
        >
          {name}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onConnect && (
          <button
            type="button"
            className="text-[8px] font-medium text-primary hover:underline"
            onClick={onConnect}
          >
            Connect
          </button>
        )}
        <MonoText className={cn("text-[8px]", labelColorMap[memberStatus])}>
          {labelMap[memberStatus]}
        </MonoText>
      </div>
    </div>
  );
}
```

4. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

### Task 4: Add "Connect to Lead" to PhaseQuicklook

**Files:**
- `tina-web/src/components/PhaseQuicklook.tsx`

**Model:** opus

**review:** full

**Depends on:** 1, 2

Add a "Connect to Lead" button in the PhaseQuicklook team section header. The button connects to the orchestration team lead's existing tmux pane. The lead is identified as the team member with `agentType` containing "team-lead" or `agentName` matching "team-lead" from the orchestration-scope members (those with non-finite or ≤0 phase number).

**Steps:**

1. Add imports at top of `PhaseQuicklook.tsx`:
```typescript
import { useCreateSession } from "@/hooks/useCreateSession"
```

2. Inside the `PhaseQuicklook` component, after `const status = ...`, add:

```typescript
  const { connectToPane } = useCreateSession()

  // Find orchestration team lead's pane ID
  const leadPaneId = (() => {
    for (const member of teamMembers) {
      const agentType = Option.getOrUndefined(member.agentType)
      const paneId = Option.getOrUndefined(member.tmuxPaneId)
      if (!paneId) continue
      if (agentType === "team-lead" || member.agentName === "team-lead") {
        return paneId
      }
    }
    return undefined
  })()
```

Note: The `teamMembers` prop passed to PhaseQuicklook is phase-specific. The team lead is an orchestration-scope member. We need to accept an additional prop for the lead's pane ID. Update the component interface:

Actually, looking at the PhaseQuicklook usage in PhaseTimelinePanel, it gets `teamMembers` from the detail. The team lead may not be in the phase-specific members. Instead, pass a `leadPaneId` prop directly.

Update `PhaseQuicklookProps`:
```typescript
export interface PhaseQuicklookProps {
  orchestrationId: string
  phase: Phase
  tasks: TaskEvent[]
  teamMembers: TeamMember[]
  leadPaneId?: string
  onClose: () => void
}
```

Update the component to use the prop:
```typescript
export function PhaseQuicklook({ orchestrationId, phase, tasks, teamMembers, leadPaneId, onClose }: PhaseQuicklookProps) {
  const [showPlanQuicklook, setShowPlanQuicklook] = useState(false)
  const { connectToPane } = useCreateSession()
  const status = toStatusBadgeStatus(phase.status)
```

Add the "Connect to Lead" button in the Team section header (around line 86):
```tsx
<section className={styles.section}>
  <div className="flex items-center justify-between">
    <h3 className={styles.sectionTitle}>Team</h3>
    {leadPaneId && (
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={() => connectToPane(leadPaneId)}
      >
        Connect to Lead
      </button>
    )}
  </div>
```

3. Update the PhaseQuicklook call site in `PhaseTimelinePanel.tsx` to pass `leadPaneId`.

In `PhaseTimelinePanel.tsx`, find where PhaseQuicklook is rendered and add:

```tsx
const leadPaneId = (() => {
  for (const member of detail.teamMembers) {
    const agentType = Option.getOrUndefined(member.agentType)
    const paneId = Option.getOrUndefined(member.tmuxPaneId)
    if (!paneId) continue
    if (agentType === "team-lead" || member.agentName === "team-lead") {
      return paneId
    }
  }
  return undefined
})()
```

Pass `leadPaneId={leadPaneId}` to `<PhaseQuicklook>`.

4. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

### Task 5: Add "Discuss" button to TaskQuicklook

**Files:**
- `tina-web/src/components/TaskQuicklook.tsx`

**Model:** opus

**review:** full

**Depends on:** 2

Add a "Discuss" button to the TaskQuicklook dialog. Clicking creates an ad-hoc session seeded with the task subject, description, and status, then navigates to the terminal view. One click, no dialog.

**Steps:**

1. Add imports:
```typescript
import { useCreateSession } from "@/hooks/useCreateSession"
```

2. Inside `TaskQuicklook`, add the hook and handler:

After the existing `const status = ...` and `const blockedBy = ...` lines:
```typescript
  const { createAndConnect } = useCreateSession()

  const handleDiscuss = () => {
    const description = Option.getOrUndefined(task.description) ?? ""
    const summary = `${task.subject}\n\nStatus: ${task.status}\n\n${description}`.trim()
    createAndConnect({
      label: `Discuss: ${task.subject}`,
      contextType: "task",
      contextId: task._id,
      contextSummary: summary,
    })
  }
```

3. Add the "Discuss" button in the QuicklookDialog. Add it after the Details section, before the blockedBy section:

```tsx
      <section className={styles.section}>
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={handleDiscuss}
        >
          Discuss this task
        </button>
      </section>
```

4. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

### Task 6: Add "Refine Plan" button to PlanQuicklook

**Files:**
- `tina-web/src/components/PlanQuicklook.tsx`

**Model:** opus

**review:** full

**Depends on:** 2

Add a "Refine Plan" button to the PlanQuicklook header. Clicking creates an ad-hoc session seeded with the plan's markdown content, then navigates to the terminal view.

**Steps:**

1. Add imports:
```typescript
import { useCreateSession } from "@/hooks/useCreateSession"
```

2. Inside `PlanQuicklook`, after the `useQuicklookKeyboard` and `useFocusTrap` calls, add:

```typescript
  const { createAndConnect } = useCreateSession()

  const handleRefinePlan = () => {
    if (result.status !== "success" || !result.data) return
    createAndConnect({
      label: `Refine: Phase ${phaseNumber} Plan`,
      contextType: "plan",
      contextSummary: result.data.content.slice(0, 2000),
    })
  }
```

3. Add the "Refine Plan" button next to the close button in the header (line 40-49 area):

Replace the header div content to include the button:
```tsx
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Phase {phaseNumber} Plan
          </h2>
          {result.status === "success" && result.data && (
            <button
              type="button"
              className="text-xs text-primary hover:underline ml-auto mr-2"
              onClick={handleRefinePlan}
            >
              Refine Plan
            </button>
          )}
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close quicklook"
          >
            x
          </button>
        </div>
```

4. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

### Task 7: Add "Discuss Design" button to DesignDetailPage

**Files:**
- `tina-web/src/components/pm/DesignDetailPage.tsx`

**Model:** opus

**review:** full

**Depends on:** 2

Add a "Discuss Design" button to the DesignDetailPage action bar. Clicking creates an ad-hoc session seeded with the design document's markdown content, then navigates to the terminal view.

**Steps:**

1. Add import:
```typescript
import { useCreateSession } from "@/hooks/useCreateSession"
```

2. Inside `DesignDetailPage`, after the existing `const` declarations, add:

```typescript
  const { createAndConnect } = useCreateSession()

  const handleDiscussDesign = () => {
    createAndConnect({
      label: `Discuss: ${design.title}`,
      contextType: "design",
      contextId: designId,
      contextSummary: design.markdown.slice(0, 2000),
    })
  }
```

3. Add the "Discuss Design" button to the actions bar (line 140-159), alongside the existing transition and edit buttons:

After the Edit button and before the closing `</div>` of the actions div:
```tsx
        <button
          className={styles.actionButton}
          onClick={handleDiscussDesign}
        >
          Discuss Design
        </button>
```

4. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

### Task 8: Add "Review Commit" button to CommitQuicklook

**Files:**
- `tina-web/src/components/CommitQuicklook.tsx`

**Model:** opus

**review:** full

**Depends on:** 2

Add a "Review Commit" button to the CommitQuicklook dialog. Clicking creates an ad-hoc session seeded with the commit SHA, message, and stats, then navigates to the terminal view.

**Steps:**

1. Add import:
```typescript
import { useCreateSession } from "@/hooks/useCreateSession"
```

2. Inside `CommitQuicklook`, after the existing `useQuicklookKeyboard` and `useFocusTrap` calls, add:

```typescript
  const { createAndConnect } = useCreateSession()

  const handleReviewCommit = () => {
    const summary = [
      `Commit: ${commit.sha}`,
      `Message: ${commit.subject}`,
      `Author: ${commit.author}`,
      `+${commit.insertions} -${commit.deletions}`,
    ].join("\n")
    createAndConnect({
      label: `Review: ${commit.subject}`,
      contextType: "commit",
      contextId: commit._id,
      contextSummary: summary,
    })
  }
```

3. Replace the placeholder text "Full diff view coming in future update" (line 89-91) with the button:

```tsx
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={handleReviewCommit}
            >
              Review this commit
            </button>
```

4. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

### Task 9: Write tests for useCreateSession hook and contextual buttons

**Files:**
- `tina-web/src/hooks/__tests__/useCreateSession.test.ts` (new)
- `tina-web/src/components/__tests__/TeamSection.test.tsx` (update)
- `tina-web/src/components/__tests__/CommitQuicklook.test.tsx` (update)
- `tina-web/src/components/__tests__/TaskQuicklook.test.tsx` (update)

**Model:** opus

**review:** spec-only

**Depends on:** 3, 4, 5, 6, 7, 8

Write tests for the shared hook and verify contextual buttons render and trigger the right behavior.

**Steps:**

1. Create `tina-web/src/hooks/__tests__/useCreateSession.test.ts`:

Test cases:
- `connectToPane` navigates to `/projects/{id}/sessions?pane={paneId}`
- `createAndConnect` POSTs to `/sessions` with context fields and navigates on success
- `createAndConnect` throws on fetch failure

Mock `useNavigate` and `useParams` from react-router-dom, mock global `fetch`.

2. Update `tina-web/src/components/__tests__/TeamSection.test.tsx`:

Add test:
- Renders "Connect" button for team members that have a tmuxPaneId

3. Update `tina-web/src/components/__tests__/CommitQuicklook.test.tsx`:

Add test:
- Renders "Review this commit" button
- Button click calls fetch with commit context

4. Update `tina-web/src/components/__tests__/TaskQuicklook.test.tsx`:

Add test:
- Renders "Discuss this task" button

5. Run tests:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx vitest run src/hooks/__tests__/useCreateSession.test.ts src/components/__tests__/TeamSection.test.tsx src/components/__tests__/CommitQuicklook.test.tsx src/components/__tests__/TaskQuicklook.test.tsx 2>&1 | tail -30
```

Expected: all tests pass.

---

### Task 10: Verify full build and test suite

**Files:**
- (none — verification only)

**Model:** haiku

**review:** spec-only

**Depends on:** 9

Run full typecheck and test suite to ensure nothing is broken.

**Steps:**

1. Run typecheck:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit
```

Expected: no errors.

2. Run test suite:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass.

3. Run build:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

---

## Phase Estimates

| Task | Estimate | Parallelizable with |
|------|----------|---------------------|
| 1. TeamMember schema | 2 min | 2 |
| 2. useCreateSession hook | 4 min | 1 |
| 3. Connect on team members | 5 min | 4, 5, 6, 7, 8 (needs 1, 2) |
| 4. Connect to Lead | 4 min | 3, 5, 6, 7, 8 (needs 1, 2) |
| 5. Discuss task button | 3 min | 3, 4, 6, 7, 8 (needs 2) |
| 6. Refine Plan button | 3 min | 3, 4, 5, 7, 8 (needs 2) |
| 7. Discuss Design button | 3 min | 3, 4, 5, 6, 8 (needs 2) |
| 8. Review Commit button | 3 min | 3, 4, 5, 6, 7 (needs 2) |
| 9. Tests | 5 min | — (needs 3-8) |
| 10. Verify build | 3 min | — (needs 9) |
| **Total** | **~35 min** | |

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
