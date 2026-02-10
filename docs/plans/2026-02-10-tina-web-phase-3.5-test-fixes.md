# Phase 3.5: Fix Convex Query Mock Failures in Component Tests

## Problem Statement

31 tests are failing across 3 test files due to missing ConvexProvider in test setups:
- `PhaseQuicklook.test.tsx`: 19 failures
- `RightPanel.test.tsx`: 6 failures
- `TeamSection.test.tsx`: 6 failures

The root cause is that these components use `useTypedQuery` to fetch data from Convex (events.list, commits.list, plans.get), but tests aren't providing the required mock infrastructure.

## Root Cause Analysis

### Components Affected

1. **PhaseQuicklook** → contains **CommitListPanel** (uses `CommitListQuery`)
2. **PhaseQuicklook** → contains **PlanQuicklook** (uses `PlanQuery`)
3. **TeamSection** → uses `EventListQuery` (for agent_shutdown events)
4. **RightPanel** → uses `useOrchestrationEvents` → `EventListQuery`

### Queries Used

- `events.list` (EventListQuery) — used by TeamSection, RightPanel
- `commits.list` (CommitListQuery) — used by CommitListPanel in PhaseQuicklook
- `plans.get` (PlanQuery) — used by PlanQuicklook in PhaseQuicklook

## Solution Design

### Strategy

Use existing test infrastructure from `/Users/joshua/Projects/tina/tina-web/src/test/harness/app-runtime.tsx`:
- Mock `useTypedQuery` using `installAppRuntimeQueryMock`
- Provide query state map with `querySuccess([])` for empty results
- Follow pattern from passing tests like `GitOpsSection.test.tsx`

### Implementation Plan

#### 1. Fix PhaseQuicklook.test.tsx

**Changes needed:**
- Mock `useTypedQuery` hook
- Install app runtime query mock with empty states for:
  - `commits.list` → `querySuccess([])`
  - `plans.get` → `querySuccess(null)`
- Wrap render calls with `renderWithRuntime` instead of plain `render`

**Code pattern:**
```typescript
import { vi, beforeEach } from "vitest"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess } from "@/test/builders/query"

vi.mock("@/hooks/useTypedQuery")
const mockUseTypedQuery = vi.mocked(await import("@/hooks/useTypedQuery")).useTypedQuery

beforeEach(() => {
  installAppRuntimeQueryMock(mockUseTypedQuery, {
    states: {
      "commits.list": querySuccess([]),
      "plans.get": querySuccess(null),
    },
  })
})
```

#### 2. Fix TeamSection.test.tsx

**Changes needed:**
- Mock `useTypedQuery` hook
- Install app runtime query mock with:
  - `events.list` → `querySuccess([])`
- Already renders plain component (no router needed), just need query mock

**Code pattern:**
```typescript
vi.mock("@/hooks/useTypedQuery")
const mockUseTypedQuery = vi.mocked(await import("@/hooks/useTypedQuery")).useTypedQuery

beforeEach(() => {
  installAppRuntimeQueryMock(mockUseTypedQuery, {
    states: {
      "events.list": querySuccess([]),
    },
  })
})
```

#### 3. Fix RightPanel.test.tsx

**Changes needed:**
- Mock `useTypedQuery` hook
- Install app runtime query mock with:
  - `events.list` → `querySuccess([])`
- RightPanel uses `useOrchestrationEvents` which calls `EventListQuery` internally

**Code pattern:**
```typescript
vi.mock("@/hooks/useTypedQuery")
const mockUseTypedQuery = vi.mocked(await import("@/hooks/useTypedQuery")).useTypedQuery

beforeEach(() => {
  installAppRuntimeQueryMock(mockUseTypedQuery, {
    states: {
      "events.list": querySuccess([]),
    },
  })
})
```

## Test Plan

1. Run `npm test` in `/Users/joshua/Projects/tina/tina-web/`
2. Verify all 31 failing tests now pass:
   - PhaseQuicklook: 19 tests pass
   - RightPanel: 6 tests pass
   - TeamSection: 6 tests pass
3. Verify no regressions in passing tests
4. Confirm test output shows 0 failures

## Files to Modify

1. `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/PhaseQuicklook.test.tsx`
   - Add `useTypedQuery` mock
   - Add `installAppRuntimeQueryMock` in beforeEach
   - Provide empty states for `commits.list` and `plans.get`

2. `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/TeamSection.test.tsx`
   - Add `useTypedQuery` mock
   - Add `installAppRuntimeQueryMock` in beforeEach
   - Provide empty state for `events.list`

3. `/Users/joshua/Projects/tina/tina-web/src/components/__tests__/RightPanel.test.tsx`
   - Add `useTypedQuery` mock
   - Add `installAppRuntimeQueryMock` in beforeEach
   - Provide empty state for `events.list`

## Success Criteria

- All 31 failing tests pass
- No test regressions
- Test output is clean (no console errors about missing ConvexProvider)
- Follows existing patterns from passing tests
