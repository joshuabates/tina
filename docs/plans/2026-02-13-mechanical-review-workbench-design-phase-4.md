# Mechanical Review Workbench — Phase 4: Web UI — Commits + Conversation

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 87f7456a01ebdbac42283bf43bab5649ba4ca7d0

**Goal:** Build the review detail page in tina-web with header, tab bar, commits list, conversation feed, and comment composer. All backend Convex queries already exist from Phase 1 — this phase is purely frontend work.

**Architecture:** New page component (`ReviewDetailPage`) with tabbed interface. Reuses existing `CommitListPanel` for commits tab. Adds new `ConversationTab` component for thread feed and comment composer. Wired via new Effect schemas and query definitions pointing to existing Convex functions.

**Phase context:** Phases 1-3 built the Convex tables (reviews, reviewThreads, reviewChecks, reviewGates), tina-session CLI commands, and daemon HTTP server. This phase builds the first web UI surface: review detail page with Commits and Conversation tabs.

**Key patterns to follow:**
- Query defs: `tina-web/src/services/data/queryDefs.ts` — `queryDef({ key, query, args, schema })`
- Effect schemas: `tina-web/src/schemas/` — `Schema.Struct` with `convexDocumentFields`
- Component pattern: `DesignDetailPage.tsx` — `useTypedQuery`, `isAnyQueryLoading`/`firstQueryError`, loading/error/success branches
- Testing: `CommitListPanel.test.tsx` — `vi.mock("@/hooks/useTypedQuery")`, `installAppRuntimeQueryMock`, `querySuccess`/`queryLoading`/`queryError`
- Status badges: `StatusBadge` component with `toStatusBadgeStatus()` mapping
- Error boundaries: `DataErrorBoundary` wrapping page content
- Routing: `App.tsx` — flat `<Route path="..." element={<Page />} />` under `<AppShell />`

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 900 |

---

## Tasks

### Task 1: Add Review and ReviewThread Effect schemas

**Files:**
- `tina-web/src/schemas/review.ts` (new)
- `tina-web/src/schemas/reviewThread.ts` (new)
- `tina-web/src/schemas/reviewGate.ts` (new)
- `tina-web/src/schemas/index.ts`
- `tina-web/src/schemas/__tests__/schemas.test.ts`

**Model:** opus

**review:** spec-only

**Depends on:** none

**Steps:**

1. Read the existing schema pattern from `tina-web/src/schemas/commit.ts` and `tina-web/src/schemas/common.ts`.

2. Add test cases to `tina-web/src/schemas/__tests__/schemas.test.ts` for the new schemas. The tests should verify that valid review, thread, and gate objects decode successfully and that missing required fields fail.

3. Create `tina-web/src/schemas/review.ts`:
```typescript
import { Schema } from "effect"
import { convexDocumentFields } from "./common"

export const ReviewSummary = Schema.Struct({
  ...convexDocumentFields,
  orchestrationId: Schema.String,
  phaseNumber: Schema.optionalWith(Schema.String, { as: "Option" }),
  state: Schema.String,
  reviewerAgent: Schema.String,
  startedAt: Schema.String,
  completedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
})

export type ReviewSummary = typeof ReviewSummary.Type
```

4. Create `tina-web/src/schemas/reviewThread.ts`:
```typescript
import { Schema } from "effect"
import { convexDocumentFields } from "./common"

export const ReviewThread = Schema.Struct({
  ...convexDocumentFields,
  reviewId: Schema.String,
  orchestrationId: Schema.String,
  filePath: Schema.String,
  line: Schema.Number,
  commitSha: Schema.String,
  summary: Schema.String,
  body: Schema.String,
  severity: Schema.String,
  status: Schema.String,
  source: Schema.String,
  author: Schema.String,
  gateImpact: Schema.String,
  createdAt: Schema.String,
  resolvedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  resolvedBy: Schema.optionalWith(Schema.String, { as: "Option" }),
})

export type ReviewThread = typeof ReviewThread.Type
```

5. Create `tina-web/src/schemas/reviewGate.ts`:
```typescript
import { Schema } from "effect"
import { convexDocumentFields } from "./common"

export const ReviewGate = Schema.Struct({
  ...convexDocumentFields,
  orchestrationId: Schema.String,
  gateId: Schema.String,
  status: Schema.String,
  owner: Schema.String,
  decidedBy: Schema.optionalWith(Schema.String, { as: "Option" }),
  decidedAt: Schema.optionalWith(Schema.String, { as: "Option" }),
  summary: Schema.String,
})

export type ReviewGate = typeof ReviewGate.Type
```

6. Update `tina-web/src/schemas/index.ts` to export the new schemas:
```typescript
export { ReviewSummary } from "./review"
export { ReviewThread } from "./reviewThread"
export { ReviewGate } from "./reviewGate"
```

7. Run tests:
```
Run: cd tina-web && npx vitest run src/schemas/__tests__/schemas.test.ts
Expected: All schema tests pass
```

---

### Task 2: Add review query definitions

**Files:**
- `tina-web/src/services/data/queryDefs.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 1

**Steps:**

1. Read `tina-web/src/services/data/queryDefs.ts`.

2. Add imports for the new schemas at the top:
```typescript
import { ReviewSummary, ReviewThread, ReviewGate } from "@/schemas"
```

3. Add query definitions at the end of the file:
```typescript
export const ReviewDetailQuery = queryDef({
  key: "reviews.detail",
  query: api.reviews.getReview,
  args: Schema.Struct({ reviewId: Schema.String }),
  schema: Schema.NullOr(ReviewSummary),
})

export const ReviewListQuery = queryDef({
  key: "reviews.list",
  query: api.reviews.listReviewsByOrchestration,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    phaseNumber: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(ReviewSummary),
})

export const ReviewThreadListQuery = queryDef({
  key: "reviewThreads.list",
  query: api.reviewThreads.listThreadsByReview,
  args: Schema.Struct({
    reviewId: Schema.String,
    status: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(ReviewThread),
})

export const ReviewGateListQuery = queryDef({
  key: "reviewGates.list",
  query: api.reviewGates.listGatesByOrchestration,
  args: Schema.Struct({ orchestrationId: Schema.String }),
  schema: Schema.Array(ReviewGate),
})
```

4. Verify the Convex API types exist (they were generated in Phase 1):
```
Run: cd tina-web && npx tsc --noEmit 2>&1 | head -20
Expected: No type errors related to review queries (or clean compile)
```

---

### Task 3: Add review status styles

**Files:**
- `tina-web/src/components/ui/status-styles.ts`
- `tina-web/src/components/ui/__tests__/status-styles.test.ts`

**Model:** opus

**review:** spec-only

**Depends on:** none

**Steps:**

1. Read `tina-web/src/components/ui/status-styles.ts` and existing test file.

2. Add test cases for new review statuses to the test file: "open", "changes_requested", "superseded" should map to appropriate styles.

3. Add review status values to the `STATUS_VALUES` array:
```typescript
const STATUS_VALUES = [
  // ... existing values ...
  // Review statuses
  "open",
  "changes_requested",
  "superseded",
] as const
```

4. Add style entries to `statusStyleMap`:
```typescript
// Review statuses
open: {
  label: "Open",
  textClass: "text-status-executing",
  iconBgClass: "bg-primary phase-glow",
  borderClass: "border-l-status-executing",
  badgeClass: "text-status-executing border-status-executing/30 bg-status-executing/12",
},
changes_requested: {
  label: "Changes Requested",
  textClass: "text-status-warning",
  iconBgClass: "bg-status-warning",
  borderClass: "border-l-status-warning",
  badgeClass: "text-status-warning border-status-warning/30 bg-status-warning/8",
},
superseded: {
  label: "Superseded",
  textClass: "text-muted-foreground",
  iconBgClass: "bg-card",
  borderClass: "border-l-muted",
  badgeClass: "text-muted-foreground border-muted bg-transparent",
},
```

5. Run tests:
```
Run: cd tina-web && npx vitest run src/components/ui/__tests__/status-styles.test.ts
Expected: All status-styles tests pass
```

---

### Task 4: Add review detail route

**Files:**
- `tina-web/src/App.tsx`

**Model:** haiku

**review:** spec-only

**Depends on:** none

**Steps:**

1. Read `tina-web/src/App.tsx`.

2. Add import for the new ReviewDetailPage component (will be created in Task 5):
```typescript
import { ReviewDetailPage } from "./components/ReviewDetailPage"
```

3. Add route inside the `<Route element={<AppShell />}>` block, before the catch-all route:
```tsx
<Route path="orchestrations/:orchestrationId/reviews/:reviewId" element={<ReviewDetailPage />} />
```

The full Routes block becomes:
```tsx
<Routes>
  <Route element={<AppShell />}>
    <Route index element={<OrchestrationPage />} />
    <Route path="orchestrations/:orchestrationId/reviews/:reviewId" element={<ReviewDetailPage />} />
    <Route path="pm" element={<PmShell />}>
      <Route path="designs/:designId" element={<DesignDetailPage />} />
      <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
    </Route>
    <Route path="*" element={<OrchestrationPage />} />
  </Route>
</Routes>
```

4. Type-check:
```
Run: cd tina-web && npx tsc --noEmit 2>&1 | head -10
Expected: May show import error until Task 5 creates the component. That's OK — the route structure is correct.
```

---

### Task 5: Create ReviewDetailPage component

**Files:**
- `tina-web/src/components/ReviewDetailPage.tsx` (new)
- `tina-web/src/components/ReviewDetailPage.module.scss` (new)
- `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx` (new)

**Model:** opus

**review:** full

**Depends on:** 1, 2, 3, 4

**Steps:**

1. Read existing patterns:
   - `tina-web/src/components/pm/DesignDetailPage.tsx` (detail page structure)
   - `tina-web/src/components/CommitListPanel.tsx` (commit list reuse)
   - `tina-web/src/components/__tests__/CommitListPanel.test.tsx` (test pattern)
   - `tina-web/src/test/harness/app-runtime.tsx` (query mock harness)

2. Write tests FIRST in `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { ReviewDetailPage } from "../ReviewDetailPage"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"
import { renderWithRuntime } from "@/test/harness/render"

vi.mock("@/hooks/useTypedQuery")
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return { ...mod, useMutation: vi.fn(() => vi.fn()) }
})
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>()
  return { ...mod, useParams: vi.fn(() => ({ orchestrationId: "orch1", reviewId: "rev1" })) }
})

const mockUseTypedQuery = vi.mocked(await import("@/hooks/useTypedQuery")).useTypedQuery

// Test: shows loading skeleton while review is loading
// Test: shows review header with state badge when loaded
// Test: shows Commits + Conversation tab by default
// Test: tab switching between Commits + Conversation, Checks, Changes
// Test: shows gate status indicators in header
// Test: shows "not found" when review is null
// Test: throws to error boundary on query error
```

Tests should cover:
- Loading state (skeleton)
- Loaded state with review header (state badge, reviewer, dates)
- Gate indicators (pending/approved/blocked)
- Tab bar with 3 tabs (Commits + Conversation active, Checks and Changes placeholder)
- Not-found state when review is null
- Error state (throws to boundary)

3. Create `tina-web/src/components/ReviewDetailPage.module.scss` following the pattern from `DesignDetailPage.module.scss`:

```scss
@use '../styles/tokens' as *;

.reviewPage {
  max-width: 1200px;
  padding: 16px;
}

.header {
  margin-bottom: 16px;
}

.breadcrumb {
  font-size: 12px;
  color: $text-muted;
  margin-bottom: 4px;
}

.breadcrumb a {
  color: $text-muted;
  text-decoration: none;
  &:hover { text-decoration: underline; }
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
  margin-top: 4px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: $text-muted;
}

.gates {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.gateIndicator {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid $border-color;
  background: $bg-card;

  &.approved { border-color: hsl(var(--status-complete)); color: hsl(var(--status-complete)); }
  &.blocked { border-color: hsl(var(--status-blocked)); color: hsl(var(--status-blocked)); }
  &.pending { border-color: $border-color; color: $text-muted; }
}

.tabBar {
  display: flex;
  border-bottom: 1px solid $border-color;
  margin-bottom: 16px;
}

.tab {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: $text-muted;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;

  &.active {
    color: $text-primary;
    border-bottom-color: $accent;
  }

  &:hover:not(.active) {
    color: $text-primary;
  }
}

.tabContent {
  min-height: 200px;
}

.loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.skeletonBar {
  height: 20px;
  width: 200px;
  background: hsl(var(--border));
  border-radius: 4px;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.skeletonRow {
  height: 120px;
  width: 100%;
  background: hsl(var(--border));
  border-radius: 4px;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.notFound {
  font-size: 14px;
  color: $text-muted;
  padding: 24px 0;
}

.placeholder {
  color: $text-muted;
  font-size: 13px;
  padding: 24px;
  text-align: center;
  border: 1px dashed $border-color;
  border-radius: 6px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

4. Create `tina-web/src/components/ReviewDetailPage.tsx`:

```typescript
import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import {
  ReviewDetailQuery,
  ReviewGateListQuery,
} from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { StatusBadge } from "@/components/ui/status-badge"
import { toStatusBadgeStatus } from "@/components/ui/status-styles"
import { DataErrorBoundary } from "./DataErrorBoundary"
import { CommitListPanel } from "./CommitListPanel"
import { ConversationTab } from "./ConversationTab"
import type { ReviewGate } from "@/schemas"
import styles from "./ReviewDetailPage.module.scss"

type TabId = "conversation" | "checks" | "changes"

const TABS: { id: TabId; label: string }[] = [
  { id: "conversation", label: "Commits + Conversation" },
  { id: "checks", label: "Checks" },
  { id: "changes", label: "Changes" },
]

const REVIEW_STATE_LABELS: Record<string, string> = {
  open: "Open",
  changes_requested: "Changes Requested",
  approved: "Approved",
  superseded: "Superseded",
}

function GateIndicator({ gate }: { gate: ReviewGate }) {
  const statusClass = styles[gate.status] ?? ""
  return (
    <span className={`${styles.gateIndicator} ${statusClass}`}>
      {gate.gateId}: {gate.status}
    </span>
  )
}

function ReviewDetailContent() {
  const { orchestrationId, reviewId } = useParams<{
    orchestrationId: string
    reviewId: string
  }>()
  const [activeTab, setActiveTab] = useState<TabId>("conversation")

  const reviewResult = useTypedQuery(ReviewDetailQuery, {
    reviewId: reviewId ?? "",
  })
  const gatesResult = useTypedQuery(ReviewGateListQuery, {
    orchestrationId: orchestrationId ?? "",
  })

  if (isAnyQueryLoading(reviewResult)) {
    return (
      <div data-testid="review-detail-page" className={styles.reviewPage}>
        <div data-testid="review-loading" className={styles.loading}>
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonBar} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    )
  }

  const queryError = firstQueryError(reviewResult, gatesResult)
  if (queryError) {
    throw queryError
  }

  if (reviewResult.status !== "success") return null

  const review = reviewResult.data
  if (!review) {
    return (
      <div data-testid="review-detail-page" className={styles.reviewPage}>
        <div className={styles.notFound}>Review not found</div>
      </div>
    )
  }

  const gates: ReviewGate[] =
    gatesResult.status === "success" ? (gatesResult.data ?? []) : []

  const phaseLabel = review.phaseNumber
    ? `Phase ${review.phaseNumber}`
    : "Orchestration Review"

  return (
    <div data-testid="review-detail-page" className={styles.reviewPage}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link to={`/?orch=${orchestrationId}`}>Orchestration</Link>
          {" / "}
          <span>{phaseLabel}</span>
        </div>
        <h2 className={styles.title}>
          {phaseLabel} Review
          <StatusBadge
            status={toStatusBadgeStatus(review.state)}
            label={REVIEW_STATE_LABELS[review.state] ?? review.state}
            style={{ marginLeft: 8 }}
          />
        </h2>
        <div className={styles.meta}>
          <span>Reviewer: {review.reviewerAgent}</span>
          <span>Started: {new Date(review.startedAt).toLocaleString()}</span>
        </div>
        {gates.length > 0 && (
          <div className={styles.gates} data-testid="gate-indicators">
            {gates.map((gate) => (
              <GateIndicator key={gate.gateId} gate={gate} />
            ))}
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className={styles.tabBar} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent} role="tabpanel">
        {activeTab === "conversation" && (
          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-semibold mb-2">Commits</h3>
              <CommitListPanel
                orchestrationId={orchestrationId ?? ""}
                phaseNumber={review.phaseNumber ?? undefined}
              />
            </section>
            <section>
              <h3 className="text-sm font-semibold mb-2">Conversation</h3>
              <ConversationTab
                reviewId={reviewId ?? ""}
                orchestrationId={orchestrationId ?? ""}
              />
            </section>
          </div>
        )}
        {activeTab === "checks" && (
          <div className={styles.placeholder}>
            Checks tab — coming in Phase 5
          </div>
        )}
        {activeTab === "changes" && (
          <div className={styles.placeholder}>
            Changes tab — coming in Phase 6
          </div>
        )}
      </div>
    </div>
  )
}

export function ReviewDetailPage() {
  return (
    <DataErrorBoundary panelName="review">
      <ReviewDetailContent />
    </DataErrorBoundary>
  )
}
```

5. Run tests:
```
Run: cd tina-web && npx vitest run src/components/__tests__/ReviewDetailPage.test.tsx
Expected: All tests pass
```

---

### Task 6: Create ConversationTab component

**Files:**
- `tina-web/src/components/ConversationTab.tsx` (new)
- `tina-web/src/components/__tests__/ConversationTab.test.tsx` (new)

**Model:** opus

**review:** full

**Depends on:** 1, 2

**Steps:**

1. Write tests FIRST in `tina-web/src/components/__tests__/ConversationTab.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { ConversationTab } from "../ConversationTab"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading } from "@/test/builders/query"

vi.mock("@/hooks/useTypedQuery")
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return { ...mod, useMutation: vi.fn(() => vi.fn()) }
})

const mockUseTypedQuery = vi.mocked(await import("@/hooks/useTypedQuery")).useTypedQuery
```

Test cases:
- Loading state shows loading text
- Empty threads shows "No comments yet"
- Renders thread cards with summary, body, severity badge, author, file:line reference
- General comments (empty filePath) render without file:line
- Comment composer has summary input, body textarea, and submit button
- Submitting calls createThread mutation with correct args (source="human", filePath="", line=0)
- Thread cards show severity with appropriate visual treatment (p0=red, p1=yellow, p2=grey)
- Threads are displayed in chronological order

2. Create `tina-web/src/components/ConversationTab.tsx`:

```typescript
import { useState } from "react"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ReviewThreadListQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import type { ReviewThread } from "@/schemas"

interface ConversationTabProps {
  reviewId: string
  orchestrationId: string
}

const SEVERITY_STYLES: Record<string, string> = {
  p0: "text-red-500 border-red-500/30 bg-red-500/8",
  p1: "text-yellow-500 border-yellow-500/30 bg-yellow-500/8",
  p2: "text-muted-foreground border-muted bg-transparent",
}

function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.p2
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-bold uppercase border ${style}`}
    >
      {severity}
    </span>
  )
}

function ThreadCard({ thread }: { thread: ReviewThread }) {
  const hasFileAnchor = thread.filePath !== ""
  const initials = thread.author.slice(0, 2).toUpperCase()

  return (
    <div className="p-3 border border-border rounded-lg space-y-2" data-testid="thread-card">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{thread.author}</span>
            <SeverityBadge severity={thread.severity} />
            <span className="text-xs text-muted-foreground">
              {thread.source === "agent" ? "Agent" : "Human"}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(thread.createdAt).toLocaleString()}
            </span>
          </div>
          {hasFileAnchor && (
            <div className="text-xs text-primary font-mono mt-1">
              {thread.filePath}:{thread.line}
            </div>
          )}
          <div className="text-sm font-medium mt-1">{thread.summary}</div>
          <div className="text-sm text-muted-foreground mt-1">{thread.body}</div>
          {thread.status === "resolved" && (
            <div className="text-xs text-green-500 mt-1">
              Resolved by {thread.resolvedBy ?? "unknown"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CommentComposer({
  reviewId,
  orchestrationId,
}: {
  reviewId: string
  orchestrationId: string
}) {
  const [summary, setSummary] = useState("")
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const createThread = useMutation(api.reviewThreads.createThread)

  const handleSubmit = async () => {
    if (!summary.trim()) return
    setSubmitting(true)
    try {
      await createThread({
        reviewId: reviewId as Id<"reviews">,
        orchestrationId: orchestrationId as Id<"orchestrations">,
        filePath: "",
        line: 0,
        commitSha: "",
        summary: summary.trim(),
        body: body.trim(),
        severity: "p2",
        source: "human",
        author: "human",
        gateImpact: "review",
      })
      setSummary("")
      setBody("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2" data-testid="comment-composer">
      <input
        type="text"
        placeholder="Summary"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-border rounded bg-background"
        aria-label="Comment summary"
      />
      <textarea
        placeholder="Add a comment..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full px-3 py-1.5 text-sm border border-border rounded bg-background resize-y"
        aria-label="Comment body"
      />
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!summary.trim() || submitting}
          className="px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Comment"}
        </button>
      </div>
    </div>
  )
}

export function ConversationTab({ reviewId, orchestrationId }: ConversationTabProps) {
  const result = useTypedQuery(ReviewThreadListQuery, { reviewId })

  return (
    <div className="space-y-4">
      <CommentComposer reviewId={reviewId} orchestrationId={orchestrationId} />

      {matchQueryResult(result, {
        loading: () => (
          <div className="text-muted-foreground text-sm">Loading comments...</div>
        ),
        error: () => (
          <div className="text-red-500 text-sm">Failed to load comments</div>
        ),
        success: (threads) => {
          if (!threads || threads.length === 0) {
            return <div className="text-muted-foreground text-sm">No comments yet</div>
          }

          return (
            <div className="space-y-3">
              {threads.map((thread) => (
                <ThreadCard key={thread._id} thread={thread} />
              ))}
            </div>
          )
        },
      })}
    </div>
  )
}
```

3. Run tests:
```
Run: cd tina-web && npx vitest run src/components/__tests__/ConversationTab.test.tsx
Expected: All tests pass
```

---

### Task 7: Update test harness for review queries

**Files:**
- `tina-web/src/test/harness/app-runtime.tsx`
- `tina-web/src/test/builders/domain/entities.ts`

**Model:** opus

**review:** spec-only

**Depends on:** 1

**Steps:**

1. Read existing builder patterns in `tina-web/src/test/builders/domain/entities.ts`.

2. Add builder functions for review entities:

```typescript
import type { ReviewSummary, ReviewThread, ReviewGate } from "@/schemas"

export function buildReviewSummary(
  overrides: Partial<ReviewSummary> = {},
): ReviewSummary {
  return {
    _id: "rev1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: some("1"),
    state: "open",
    reviewerAgent: "test-review-agent",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: none<string>(),
    ...overrides,
  }
}

export function buildReviewThread(
  overrides: Partial<ReviewThread> = {},
): ReviewThread {
  return {
    _id: "thread1",
    _creationTime: 1234567890,
    reviewId: "rev1",
    orchestrationId: "orch1",
    filePath: "src/foo.ts",
    line: 42,
    commitSha: "abc123",
    summary: "Test finding",
    body: "Detailed explanation of the finding",
    severity: "p1",
    status: "unresolved",
    source: "agent",
    author: "review-agent",
    gateImpact: "review",
    createdAt: "2024-01-01T10:00:00Z",
    resolvedAt: none<string>(),
    resolvedBy: none<string>(),
    ...overrides,
  }
}

export function buildReviewGate(
  overrides: Partial<ReviewGate> = {},
): ReviewGate {
  return {
    _id: "gate1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    gateId: "review",
    status: "pending",
    owner: "orchestrator",
    decidedBy: none<string>(),
    decidedAt: none<string>(),
    summary: "Awaiting review",
    ...overrides,
  }
}
```

3. Add review-related query key handling to `app-runtime.tsx` if needed (the existing `queryStateFor` fallback handles arbitrary query keys via the states map, so no changes to app-runtime.tsx should be needed).

4. Run builder and harness tests:
```
Run: cd tina-web && npx vitest run src/test/
Expected: All test utility tests pass
```

---

### Task 8: Integration test and type-check

**Files:**
- (no new files — verification task)

**Model:** opus

**review:** full

**Depends on:** 4, 5, 6, 7

**Steps:**

1. Run full type-check:
```
Run: cd tina-web && npx tsc --noEmit
Expected: Clean compile, no errors
```

2. Run all tina-web tests:
```
Run: cd tina-web && npx vitest run
Expected: All tests pass including new review tests
```

3. Start dev server and verify the page loads:
```
Run: cd tina-web && npx vite build 2>&1 | tail -5
Expected: Build succeeds without errors
```

4. Verify no lint issues:
```
Run: cd tina-web && npx eslint src/components/ReviewDetailPage.tsx src/components/ConversationTab.tsx src/schemas/review.ts src/schemas/reviewThread.ts src/schemas/reviewGate.ts --max-warnings 0 2>&1 | tail -5
Expected: No lint errors or warnings
```

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Effect schemas (review, thread, gate) | 10 min |
| 2 | Query definitions | 5 min |
| 3 | Status styles | 5 min |
| 4 | Route setup | 3 min |
| 5 | ReviewDetailPage component + tests | 25 min |
| 6 | ConversationTab component + tests | 20 min |
| 7 | Test harness builders | 10 min |
| 8 | Integration test and type-check | 10 min |
| **Total** | | **~88 min** |

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
