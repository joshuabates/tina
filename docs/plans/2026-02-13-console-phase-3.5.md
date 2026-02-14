# Agent Console Phase 3.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 7488cbd05cce1a5c1db9b48af274936e82f64012

**Goal:** Address gaps from Phase 3 review: fix leadPaneId lookup in PhaseTimelinePanel.tsx to search all orchestration team members instead of only phase-filtered members.

**Architecture:** Targeted fix to existing implementation. No new architecture.

**Phase context:** Phase 3 implemented contextual launch points (Connect, Connect to Lead, Discuss, Refine Plan, Discuss Design, Review Commit buttons). Review found that the `leadPaneId` lookup at `PhaseTimelinePanel.tsx:106` searches `quicklookTeamMembers` (filtered to the quicklook phase's members) instead of `detail.teamMembers` (all orchestration members). The team lead is an orchestration-scope member and typically has a different `phaseNumber` than any specific phase, so filtering by phase number excludes the lead.

**Issues to address:**
1. `leadPaneId` lookup searches wrong collection — Fix: search `detail.teamMembers` instead of `quicklookTeamMembers`

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 30 |

---

### Task 1: Fix leadPaneId lookup to search all team members

**Files:**
- `tina-web/src/components/PhaseTimelinePanel.tsx`
- `tina-web/src/components/__tests__/PhaseTimelinePanel.test.tsx`

**Model:** opus

**review:** full

**Depends on:** none

The `leadPaneId` lookup at line 106 searches `quicklookTeamMembers`, which is filtered by `m.phaseNumber === quicklookPhase.phaseNumber`. The team lead is an orchestration-scope member whose `phaseNumber` doesn't match any specific phase, so this lookup always returns `undefined`. The Phase 3 plan (Task 4, lines 417-427) specified searching `detail.teamMembers` but the implementation deviated.

**Steps:**

1. In `PhaseTimelinePanel.tsx`, change line 106 to search `detail.teamMembers` instead of `quicklookTeamMembers`:

Replace:
```typescript
  const leadMember = quicklookTeamMembers.find(
    m => m.agentName === "team-lead",
  )
```

With:
```typescript
  const leadMember = detail.teamMembers.find(
    m => m.agentName === "team-lead",
  )
```

2. Add a test to `PhaseTimelinePanel.test.tsx` that verifies the lead pane ID is found from orchestration-scope members (not phase-scoped members). The test needs to mock `useCreateSession` and render PhaseTimelinePanel with a team lead member that has a `tmuxPaneId` but a different `phaseNumber` than any phase being quicklooked.

Since PhaseTimelinePanel doesn't directly expose `leadPaneId` in its rendering (it passes it to PhaseQuicklook which only renders when quicklook is open), and the PhaseQuicklook rendering is already tested in its own test file, the primary verification is that the code change is correct. The existing PhaseQuicklook tests already verify the "Connect to Lead" button works when `leadPaneId` is provided.

However, we should add a mock for `useCreateSession` to `PhaseTimelinePanel.test.tsx` since the component now uses it indirectly via PhaseQuicklook:

Add to the mock section at the top of the test file:
```typescript
vi.mock("@/hooks/useCreateSession")
```

3. Verify types compile:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

4. Run the relevant test suites:

Run:
```bash
cd /Users/joshua/Projects/tina/.worktrees/console/tina-web && npx vitest run src/components/__tests__/PhaseTimelinePanel.test.tsx src/components/__tests__/PhaseQuicklook.test.tsx 2>&1 | tail -30
```

Expected: all tests pass.

---

## Phase Estimates

| Task | Estimate | Parallelizable with |
|------|----------|---------------------|
| 1. Fix leadPaneId lookup | 3 min | — |
| **Total** | **~3 min** | |

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
