# Mechanical Review Workbench Phase 5: Web UI — Checks

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 76aa2f38d83fd51b980a07dc0e009629e0793aab

**Goal:** Build the Checks tab in the review detail page — a real-time subscription-driven display of `reviewChecks` data showing status badges (running/passed/failed), durations, failure output, and live fill-in as the review agent works through its checklist.

**Architecture:** New `ReviewCheck` Effect schema, query definition, test builder, and `ChecksTab` component. Follows identical patterns to `ConversationTab` (Phase 4). Wired into the existing `ReviewDetailPage` tab system, replacing the Phase 5 placeholder.

**Phase context:** Phase 4 built `ReviewDetailPage` with tab shell, `ConversationTab`, `CommitListPanel`, review query defs, and test infrastructure. Phase 1 built the Convex `reviewChecks` table with `startCheck`, `completeCheck`, and `listChecksByReview` queries. This phase connects them with a frontend component.

**Files involved:**
- `tina-web/src/schemas/reviewCheck.ts` (new)
- `tina-web/src/schemas/index.ts` (edit)
- `tina-web/src/services/data/queryDefs.ts` (edit)
- `tina-web/src/test/builders/domain/entities.ts` (edit)
- `tina-web/src/components/ChecksTab.tsx` (new)
- `tina-web/src/components/__tests__/ChecksTab.test.tsx` (new)
- `tina-web/src/components/ReviewDetailPage.tsx` (edit)
- `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx` (edit)
- `tina-web/src/components/ui/status-styles.ts` (edit)

---

## Phase Estimates

| Step | Estimated Minutes |
|------|-------------------|
| Task 1: ReviewCheck schema + query def + check status styles | 3 |
| Task 2: ReviewCheck test builder | 2 |
| Task 3: ChecksTab component + tests | 5 |
| Task 4: Wire ChecksTab into ReviewDetailPage + update tests | 3 |
| **Total** | **13** |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 300 |

---

### Task 1: Add ReviewCheck Effect schema, query definition, and check status styles

**Files:**
- `tina-web/src/schemas/reviewCheck.ts` (new)
- `tina-web/src/schemas/index.ts` (edit)
- `tina-web/src/services/data/queryDefs.ts` (edit)
- `tina-web/src/components/ui/status-styles.ts` (edit)

**Model:** haiku

**review:** spec-only

**Depends on:** none

**Steps:**

1. Create `tina-web/src/schemas/reviewCheck.ts` with the ReviewCheck Effect schema matching the Convex `reviewChecks` table shape:

```typescript
import { Schema } from "effect"
import { optionalString, optionalNumber, orchestrationScopedDocumentFields } from "./common"

export const ReviewCheck = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  reviewId: Schema.String,
  name: Schema.String,
  kind: Schema.String,
  command: optionalString,
  status: Schema.String,
  comment: optionalString,
  output: optionalString,
  startedAt: Schema.String,
  completedAt: optionalString,
  durationMs: optionalNumber,
})

export type ReviewCheck = typeof ReviewCheck.Type
```

2. Add the export to `tina-web/src/schemas/index.ts`:

Add line after the `ReviewGate` export:
```typescript
export { ReviewCheck } from "./reviewCheck"
```

3. Add `ReviewCheckListQuery` to `tina-web/src/services/data/queryDefs.ts`:

Import `ReviewCheck` in the import list from `@/schemas`, then add after `ReviewGateListQuery`:

```typescript
export const ReviewCheckListQuery = queryDef({
  key: "reviewChecks.list",
  query: api.reviewChecks.listChecksByReview,
  args: Schema.Struct({ reviewId: Schema.String }),
  schema: Schema.Array(ReviewCheck),
})
```

4. Add check status values `"running"`, `"passed"`, `"failed"` to `tina-web/src/components/ui/status-styles.ts`:

Add to `STATUS_VALUES` array after `"superseded"`:
```typescript
  // Check statuses
  "running",
  "passed",
  "failed",
```

Add to `statusStyleMap` after the `superseded` entry:
```typescript
  // Check statuses
  running: {
    label: "Running",
    textClass: "text-status-executing",
    iconBgClass: "bg-primary phase-glow",
    borderClass: "border-l-status-executing",
    badgeClass: "text-status-executing border-status-executing/30 bg-status-executing/12",
  },
  passed: {
    label: "Passed",
    textClass: "text-status-complete",
    iconBgClass: "bg-status-complete",
    borderClass: "border-l-status-complete",
    badgeClass: "text-status-complete border-status-complete/30 bg-status-complete/8",
  },
  failed: {
    label: "Failed",
    textClass: "text-status-blocked",
    iconBgClass: "bg-status-blocked/10",
    borderClass: "border-l-status-blocked",
    badgeClass: "text-status-blocked border-status-blocked/30 bg-status-blocked/8",
  },
```

5. Verify:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | head -20`
Expected: No errors related to ReviewCheck or reviewChecks

---

### Task 2: Add ReviewCheck test builder

**Files:**
- `tina-web/src/test/builders/domain/entities.ts` (edit)

**Model:** haiku

**review:** spec-only

**Depends on:** 1

**Steps:**

1. Import the `ReviewCheck` type in `tina-web/src/test/builders/domain/entities.ts`:

Add `ReviewCheck` to the type import from `@/schemas`.

2. Add builder function after `buildReviewGate`:

```typescript
export function buildReviewCheck(
  overrides: Partial<ReviewCheck> = {},
): ReviewCheck {
  return {
    _id: "check1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    reviewId: "rev1",
    name: "typecheck",
    kind: "cli",
    command: some("mise typecheck"),
    status: "passed",
    comment: none<string>(),
    output: none<string>(),
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: some("2024-01-01T10:00:04Z"),
    durationMs: some(4200),
    ...overrides,
  }
}
```

3. Verify:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | head -20`
Expected: No type errors

---

### Task 3: Build ChecksTab component with tests

**Files:**
- `tina-web/src/components/ChecksTab.tsx` (new)
- `tina-web/src/components/__tests__/ChecksTab.test.tsx` (new)

**Model:** opus

**review:** full

**Depends on:** 2

**Steps:**

1. Create `tina-web/src/components/__tests__/ChecksTab.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ChecksTab } from "../ChecksTab"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"
import { buildReviewCheck } from "@/test/builders/domain/entities"
import { some, none } from "@/test/builders/domain/primitives"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

function renderTab(reviewId = "rev1") {
  return render(
    <MemoryRouter>
      <ChecksTab reviewId={reviewId} />
    </MemoryRouter>,
  )
}

describe("ChecksTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": queryLoading(),
      },
    })

    renderTab()

    expect(screen.getByText("Loading checks...")).toBeInTheDocument()
  })

  it("shows error state", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": queryError(new Error("Network error")),
      },
    })

    renderTab()

    expect(screen.getByText("Failed to load checks")).toBeInTheDocument()
  })

  it("shows empty state when no checks exist", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([]),
      },
    })

    renderTab()

    expect(screen.getByText("No checks yet")).toBeInTheDocument()
  })

  it("renders check rows with name, kind, and status badge", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([
          buildReviewCheck({
            _id: "c1",
            name: "typecheck",
            kind: "cli",
            status: "passed",
            durationMs: some(4200),
          }),
          buildReviewCheck({
            _id: "c2",
            name: "test",
            kind: "cli",
            status: "failed",
            durationMs: some(12800),
            comment: some("3 tests failed"),
            output: some("FAIL src/foo.test.ts\n  x should work"),
          }),
          buildReviewCheck({
            _id: "c3",
            name: "api-contracts",
            kind: "project",
            status: "running",
            command: none<string>(),
            completedAt: none<string>(),
            durationMs: none<number>(),
          }),
        ]),
      },
    })

    renderTab()

    expect(screen.getByText("typecheck")).toBeInTheDocument()
    expect(screen.getByText("test")).toBeInTheDocument()
    expect(screen.getByText("api-contracts")).toBeInTheDocument()

    // Status badges
    expect(screen.getByText("Passed")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("Running")).toBeInTheDocument()
  })

  it("shows duration for completed checks", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([
          buildReviewCheck({
            _id: "c1",
            name: "typecheck",
            status: "passed",
            durationMs: some(4200),
          }),
        ]),
      },
    })

    renderTab()

    expect(screen.getByText("4.2s")).toBeInTheDocument()
  })

  it("shows failure output for failed checks", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([
          buildReviewCheck({
            _id: "c1",
            name: "test",
            status: "failed",
            comment: some("3 tests failed"),
            output: some("FAIL src/foo.test.ts"),
          }),
        ]),
      },
    })

    renderTab()

    expect(screen.getByText("3 tests failed")).toBeInTheDocument()
    expect(screen.getByText("FAIL src/foo.test.ts")).toBeInTheDocument()
  })

  it("shows kind badge distinguishing cli and project checks", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([
          buildReviewCheck({ _id: "c1", name: "typecheck", kind: "cli" }),
          buildReviewCheck({ _id: "c2", name: "api-contracts", kind: "project" }),
        ]),
      },
    })

    renderTab()

    const rows = screen.getAllByTestId("check-row")
    expect(within(rows[0]).getByText("cli")).toBeInTheDocument()
    expect(within(rows[1]).getByText("project")).toBeInTheDocument()
  })
})
```

2. Create `tina-web/src/components/ChecksTab.tsx`:

```typescript
import { Option } from "effect"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ReviewCheckListQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import type { ReviewCheck } from "@/schemas"

interface ChecksTabProps {
  reviewId: string
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function CheckRow({ check }: { check: ReviewCheck }) {
  const durationMs = Option.getOrUndefined(check.durationMs)
  const comment = Option.getOrUndefined(check.comment)
  const output = Option.getOrUndefined(check.output)

  return (
    <div data-testid="check-row" className="rounded border border-zinc-800 p-3 space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium flex-1">{check.name}</span>
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-zinc-800 text-zinc-400">
          {check.kind}
        </span>
        <StatusBadge
          status={toStatusBadgeStatus(check.status)}
          label={check.status === "passed" ? "Passed" : check.status === "failed" ? "Failed" : "Running"}
        />
        {durationMs != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDuration(durationMs)}
          </span>
        )}
      </div>
      {check.status === "failed" && (comment || output) && (
        <div className="space-y-1">
          {comment && (
            <div className="text-sm text-red-400">{comment}</div>
          )}
          {output && (
            <pre className="text-xs text-muted-foreground bg-zinc-900 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function ChecksTab({ reviewId }: ChecksTabProps) {
  const result = useTypedQuery(ReviewCheckListQuery, { reviewId })

  return (
    <div className="space-y-3">
      {matchQueryResult(result, {
        loading: () => (
          <div className="text-muted-foreground text-sm">Loading checks...</div>
        ),
        error: () => (
          <div className="text-red-500 text-sm">Failed to load checks</div>
        ),
        success: (checks) => {
          if (!checks || checks.length === 0) {
            return <div className="text-muted-foreground text-sm">No checks yet</div>
          }

          return (
            <>
              {checks.map((check) => (
                <CheckRow key={check._id} check={check} />
              ))}
            </>
          )
        },
      })}
    </div>
  )
}
```

3. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && npx vitest run tina-web/src/components/__tests__/ChecksTab.test.tsx 2>&1 | tail -30`
Expected: All tests pass

---

### Task 4: Wire ChecksTab into ReviewDetailPage and update tests

**Files:**
- `tina-web/src/components/ReviewDetailPage.tsx` (edit)
- `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx` (edit)

**Model:** haiku

**review:** spec-only

**Depends on:** 3

**Steps:**

1. In `tina-web/src/components/ReviewDetailPage.tsx`, add the ChecksTab import alongside existing imports:

```typescript
import { ChecksTab } from "./ChecksTab"
```

2. Replace the checks placeholder content. Find:

```tsx
        {activeTab === "checks" && (
          <div className={styles.placeholder}>
            Checks tab — coming in Phase 5
          </div>
        )}
```

Replace with:

```tsx
        {activeTab === "checks" && (
          <ChecksTab reviewId={reviewId ?? ""} />
        )}
```

3. Update `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx`:

Add mock for ChecksTab alongside the ConversationTab mock:

```typescript
vi.mock("../ChecksTab", () => ({
  ChecksTab: () => <div data-testid="checks-tab">ChecksTab</div>,
}))
```

Update the "shows placeholder when switching to Checks tab" test to verify the ChecksTab component renders instead of a placeholder:

```typescript
  it("shows ChecksTab when switching to Checks tab", async () => {
    const user = userEvent.setup()
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(buildReviewSummary()),
        "reviewGates.list": querySuccess([]),
      },
    })

    renderPage()

    await user.click(screen.getByText("Checks"))
    expect(screen.getByTestId("checks-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("conversation-tab")).not.toBeInTheDocument()
  })
```

4. Run all review-related tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && npx vitest run tina-web/src/components/__tests__/ReviewDetailPage.test.tsx tina-web/src/components/__tests__/ChecksTab.test.tsx 2>&1 | tail -30`
Expected: All tests pass

5. Run full tina-web type check:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -10`
Expected: No errors

---

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
