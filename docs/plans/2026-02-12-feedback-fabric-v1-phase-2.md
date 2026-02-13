# Feedback Fabric v1 Phase 2: Web Feedback Panel

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 3667b0f73506b015af1c3e96387973aeeae54ead

**Goal:** Build the frontend feedback panel: Effect Schema, typed query defs, `FeedbackSection` composer/feed with resolve/reopen actions integrated into `TaskQuicklook` and `CommitQuicklook`, and `FeedbackSummarySection` blocking badge in `RightPanel`. All driven by Convex reactive queries for realtime updates.

**Architecture:** New `FeedbackEntry` and `BlockingFeedbackSummary` Effect Schemas following `WorkComment` pattern. Three new query defs registered in `queryDefs.ts`. `FeedbackSection` adapts `CommentTimeline` pattern (composer + feed) with entry-type selector and resolve/reopen actions. `FeedbackSummarySection` adapts `EventSection`/`StatPanel` pattern for blocking count. Both `TaskEvent` and `Commit` schemas already carry `orchestrationId` so no prop threading needed.

**Key files:**
- `tina-web/src/schemas/feedbackEntry.ts` — New: FeedbackEntry + BlockingFeedbackSummary schemas
- `tina-web/src/schemas/index.ts` — Add exports
- `tina-web/src/services/data/queryDefs.ts` — Add three feedback query defs
- `tina-web/src/components/FeedbackSection.tsx` — New: composer + target-scoped feed
- `tina-web/src/components/FeedbackSummarySection.tsx` — New: blocking badge/counter
- `tina-web/src/components/TaskQuicklook.tsx` — Integrate FeedbackSection
- `tina-web/src/components/CommitQuicklook.tsx` — Integrate FeedbackSection
- `tina-web/src/components/RightPanel.tsx` — Integrate FeedbackSummarySection
- `tina-web/src/components/__tests__/FeedbackSection.test.tsx` — New: section tests
- `tina-web/src/components/__tests__/FeedbackSummarySection.test.tsx` — New: summary tests

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 800 |

---

## Tasks

### Task 1: Create FeedbackEntry and BlockingFeedbackSummary Effect Schemas

**Files:**
- `tina-web/src/schemas/feedbackEntry.ts`
- `tina-web/src/schemas/index.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Create the Effect Schema definitions for feedback entry documents and the blocking summary response.

**Steps:**

1. Create `tina-web/src/schemas/feedbackEntry.ts`:

```ts
import { Schema } from "effect"
import { orchestrationScopedDocumentFields, optionalString } from "./common"

export const FeedbackEntry = Schema.Struct({
  ...orchestrationScopedDocumentFields,
  targetType: Schema.String,
  targetTaskId: optionalString,
  targetCommitSha: optionalString,
  entryType: Schema.String,
  body: Schema.String,
  authorType: Schema.String,
  authorName: Schema.String,
  status: Schema.String,
  resolvedBy: optionalString,
  resolvedAt: optionalString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})

export type FeedbackEntry = typeof FeedbackEntry.Type

export const BlockingFeedbackSummary = Schema.Struct({
  openAskForChangeCount: Schema.Number,
  entries: Schema.Array(FeedbackEntry),
})

export type BlockingFeedbackSummary = typeof BlockingFeedbackSummary.Type
```

2. Add exports to `tina-web/src/schemas/index.ts`. Append after line 16 (the `TimelineEntry` export):

```ts
export { FeedbackEntry, BlockingFeedbackSummary } from "./feedbackEntry"
```

3. Verify TypeScript compiles:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -5`

Expected: No new type errors from the schema files.

---

### Task 2: Add feedback query defs to queryDefs.ts

**Files:**
- `tina-web/src/services/data/queryDefs.ts`

**Model:** haiku

**review:** spec-only

**Depends on:** 1

Add three typed query definitions for feedback entry queries.

**Steps:**

1. Add `FeedbackEntry` and `BlockingFeedbackSummary` to the imports from `@/schemas` in `queryDefs.ts` (line 18):

Change the import from `@/schemas` (lines 3-18) to include the new types. Add `FeedbackEntry` and `BlockingFeedbackSummary` to the import list.

2. Add three query defs after the `TimelineQuery` definition (after line 184):

```ts
export const FeedbackEntryListQuery = queryDef({
  key: "feedbackEntries.list",
  query: api.feedbackEntries.listFeedbackEntriesByOrchestration,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    targetType: Schema.optional(Schema.String),
    entryType: Schema.optional(Schema.String),
    status: Schema.optional(Schema.String),
    authorType: Schema.optional(Schema.String),
  }),
  schema: Schema.Array(FeedbackEntry),
})

export const FeedbackEntryByTargetQuery = queryDef({
  key: "feedbackEntries.byTarget",
  query: api.feedbackEntries.listFeedbackEntriesByTarget,
  args: Schema.Struct({
    orchestrationId: Schema.String,
    targetType: Schema.String,
    targetRef: Schema.String,
  }),
  schema: Schema.Array(FeedbackEntry),
})

export const BlockingFeedbackSummaryQuery = queryDef({
  key: "feedbackEntries.blockingSummary",
  query: api.feedbackEntries.getBlockingFeedbackSummary,
  args: Schema.Struct({
    orchestrationId: Schema.String,
  }),
  schema: BlockingFeedbackSummary,
})
```

3. Verify TypeScript compiles:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -5`

Expected: No type errors.

---

### Task 3: Write FeedbackSection tests (TDD — tests first)

**Files:**
- `tina-web/src/components/__tests__/FeedbackSection.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 2

Write tests for the FeedbackSection component. Tests will fail until implementation in Task 4.

**Steps:**

1. Create `tina-web/src/components/__tests__/FeedbackSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { FeedbackSection } from "../FeedbackSection"
import type { FeedbackEntry } from "@/schemas"

// Mock Convex hooks
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const mockUseMutation = vi.mocked(
  (await import("convex/react")).useMutation,
)

function buildFeedbackEntry(overrides: Partial<Record<string, unknown>> = {}): FeedbackEntry {
  return {
    _id: "fb1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    targetType: "task",
    targetTaskId: Option.some("1"),
    targetCommitSha: Option.none(),
    entryType: "comment",
    body: "Looks good",
    authorType: "human",
    authorName: "alice",
    status: "open",
    resolvedBy: Option.none(),
    resolvedAt: Option.none(),
    createdAt: "2026-02-12T10:00:00Z",
    updatedAt: "2026-02-12T10:00:00Z",
    ...overrides,
  } as unknown as FeedbackEntry
}

describe("FeedbackSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows loading state", () => {
    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByTestId("feedback-section-loading")).toBeInTheDocument()
  })

  it("shows empty state when no entries", () => {
    mockUseTypedQuery.mockReturnValue({ status: "success", data: [] })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByText(/no feedback yet/i)).toBeInTheDocument()
  })

  it("renders feedback entries newest-first", () => {
    const entries = [
      buildFeedbackEntry({
        _id: "fb1",
        body: "First entry",
        createdAt: "2026-02-12T10:00:00Z",
      }),
      buildFeedbackEntry({
        _id: "fb2",
        body: "Second entry",
        createdAt: "2026-02-12T11:00:00Z",
      }),
    ]
    mockUseTypedQuery.mockReturnValue({ status: "success", data: entries })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByText("First entry")).toBeInTheDocument()
    expect(screen.getByText("Second entry")).toBeInTheDocument()
  })

  it("shows entry type badge on each entry", () => {
    const entries = [
      buildFeedbackEntry({ _id: "fb1", entryType: "ask_for_change", body: "Fix this" }),
    ]
    mockUseTypedQuery.mockReturnValue({ status: "success", data: entries })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByText("ask_for_change")).toBeInTheDocument()
  })

  it("shows resolve button for open entries", () => {
    const entries = [
      buildFeedbackEntry({ _id: "fb1", status: "open", body: "Open entry" }),
    ]
    mockUseTypedQuery.mockReturnValue({ status: "success", data: entries })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByRole("button", { name: /resolve/i })).toBeInTheDocument()
  })

  it("shows reopen button for resolved entries", () => {
    const entries = [
      buildFeedbackEntry({
        _id: "fb1",
        status: "resolved",
        resolvedBy: Option.some("bob"),
        body: "Resolved entry",
      }),
    ]
    mockUseTypedQuery.mockReturnValue({ status: "success", data: entries })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByRole("button", { name: /reopen/i })).toBeInTheDocument()
  })

  it("renders composer form with entry type selector", () => {
    mockUseTypedQuery.mockReturnValue({ status: "success", data: [] })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByPlaceholderText(/author name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/add feedback/i)).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: /entry type/i })).toBeInTheDocument()
  })

  it("submits new feedback entry via mutation", async () => {
    const user = userEvent.setup()
    const mockCreate = vi.fn().mockResolvedValue("new-id")
    mockUseMutation.mockReturnValue(mockCreate)
    mockUseTypedQuery.mockReturnValue({ status: "success", data: [] })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    await user.type(screen.getByPlaceholderText(/author name/i), "alice")
    await user.type(screen.getByPlaceholderText(/add feedback/i), "Great work")
    await user.click(screen.getByRole("button", { name: /submit/i }))

    expect(mockCreate).toHaveBeenCalledOnce()
  })
})
```

2. Run tests to confirm they fail (module not found):

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx vitest run tina-web/src/components/__tests__/FeedbackSection.test.tsx 2>&1 | tail -10`

Expected: Tests fail because `FeedbackSection` component doesn't exist yet.

---

### Task 4: Implement FeedbackSection component

**Files:**
- `tina-web/src/components/FeedbackSection.tsx`

**Model:** opus

**review:** full

**Depends on:** 3

Create the FeedbackSection component following the CommentTimeline pattern: a target-scoped feedback feed (newest-first) with a composer that supports all three entry types and resolve/reopen actions.

**Steps:**

1. Create `tina-web/src/components/FeedbackSection.tsx`:

```tsx
import { useState } from "react"
import { Option } from "effect"
import { useMutation } from "convex/react"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { FeedbackEntryByTargetQuery } from "@/services/data/queryDefs"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { formatRelativeTimeShort } from "@/lib/time"
import { api } from "@convex/_generated/api"
import type { FeedbackEntry } from "@/schemas"
import type { Id } from "@convex/_generated/dataModel"

interface FeedbackSectionProps {
  orchestrationId: string
  targetType: "task" | "commit"
  targetRef: string
}

function entryTypeLabel(entryType: string): string {
  switch (entryType) {
    case "ask_for_change": return "ask_for_change"
    case "suggestion": return "suggestion"
    default: return "comment"
  }
}

function statusColor(status: string): string {
  return status === "resolved"
    ? "text-green-400"
    : "text-muted-foreground"
}

function FeedbackEntryItem({
  entry,
  onResolve,
  onReopen,
}: {
  entry: FeedbackEntry
  onResolve: (entryId: string) => void
  onReopen: (entryId: string) => void
}) {
  const isResolved = entry.status === "resolved"
  const resolvedBy = Option.match(entry.resolvedBy, {
    onNone: () => null,
    onSome: (v) => v,
  })

  return (
    <li className="border border-border rounded p-2 space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">{entry.authorName}</span>
        <span className="text-muted-foreground">{entry.authorType}</span>
        <span className="px-1 py-0.5 rounded bg-muted text-[10px]">
          {entryTypeLabel(entry.entryType)}
        </span>
        <span className={statusColor(entry.status)}>{entry.status}</span>
        <span className="text-muted-foreground ml-auto">
          {formatRelativeTimeShort(entry.createdAt)}
        </span>
      </div>
      <div className="text-sm">{entry.body}</div>
      <div className="flex items-center gap-2">
        {isResolved ? (
          <>
            {resolvedBy && (
              <span className="text-xs text-muted-foreground">
                Resolved by {resolvedBy}
              </span>
            )}
            <button
              type="button"
              className="text-xs text-blue-400 hover:text-blue-300"
              onClick={() => onReopen(entry._id)}
              aria-label="Reopen"
            >
              Reopen
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-xs text-green-400 hover:text-green-300"
            onClick={() => onResolve(entry._id)}
            aria-label="Resolve"
          >
            Resolve
          </button>
        )}
      </div>
    </li>
  )
}

type EntryType = "comment" | "suggestion" | "ask_for_change"

function AddFeedbackForm({
  orchestrationId,
  targetType,
  targetRef,
}: FeedbackSectionProps) {
  const [authorName, setAuthorName] = useState("")
  const [body, setBody] = useState("")
  const [entryType, setEntryType] = useState<EntryType>("comment")
  const [authorType, setAuthorType] = useState<"human" | "agent">("human")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const createEntry = useMutation(api.feedbackEntries.createFeedbackEntry)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!authorName.trim() || !body.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      await createEntry({
        orchestrationId: orchestrationId as Id<"orchestrations">,
        targetType,
        ...(targetType === "task"
          ? { targetTaskId: targetRef }
          : { targetCommitSha: targetRef }),
        entryType,
        body: body.trim(),
        authorType,
        authorName: authorName.trim(),
      })
      setBody("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add feedback")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-2 pt-2 border-t border-border" onSubmit={handleSubmit}>
      <div className="flex items-center gap-2">
        <label htmlFor="feedback-author" className="sr-only">
          Author name
        </label>
        <input
          id="feedback-author"
          className="flex-1 bg-input border border-border rounded px-2 py-1 text-sm"
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Author name"
        />
        <div className="flex gap-1">
          <button
            type="button"
            className="text-xs px-1.5 py-0.5 rounded border border-border"
            data-active={authorType === "human"}
            onClick={() => setAuthorType("human")}
          >
            human
          </button>
          <button
            type="button"
            className="text-xs px-1.5 py-0.5 rounded border border-border"
            data-active={authorType === "agent"}
            onClick={() => setAuthorType("agent")}
          >
            agent
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="feedback-entry-type" className="sr-only">
          Entry type
        </label>
        <select
          id="feedback-entry-type"
          role="combobox"
          aria-label="Entry type"
          className="bg-input border border-border rounded px-2 py-1 text-sm"
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as EntryType)}
        >
          <option value="comment">Comment</option>
          <option value="suggestion">Suggestion</option>
          <option value="ask_for_change">Ask for Change</option>
        </select>
      </div>
      <div>
        <label htmlFor="feedback-body" className="sr-only">
          Feedback
        </label>
        <textarea
          id="feedback-body"
          className="w-full bg-input border border-border rounded px-2 py-1 text-sm min-h-[60px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add feedback..."
        />
      </div>
      {error && <div className="text-red-500 text-xs">{error}</div>}
      <button
        type="submit"
        className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
        disabled={!authorName.trim() || !body.trim() || submitting}
        aria-label="Submit"
      >
        {submitting ? "Submitting..." : "Submit"}
      </button>
    </form>
  )
}

export function FeedbackSection({
  orchestrationId,
  targetType,
  targetRef,
}: FeedbackSectionProps) {
  const entriesResult = useTypedQuery(FeedbackEntryByTargetQuery, {
    orchestrationId,
    targetType,
    targetRef,
  })

  const resolveEntry = useMutation(api.feedbackEntries.resolveFeedbackEntry)
  const reopenEntry = useMutation(api.feedbackEntries.reopenFeedbackEntry)

  const handleResolve = async (entryId: string) => {
    await resolveEntry({
      entryId: entryId as Id<"feedbackEntries">,
      resolvedBy: "user",
    })
  }

  const handleReopen = async (entryId: string) => {
    await reopenEntry({
      entryId: entryId as Id<"feedbackEntries">,
    })
  }

  if (isAnyQueryLoading(entriesResult)) {
    return (
      <div data-testid="feedback-section-loading" className="text-xs text-muted-foreground animate-pulse py-2">
        Loading feedback...
      </div>
    )
  }

  const queryError = firstQueryError(entriesResult)
  if (queryError) {
    throw queryError
  }

  if (entriesResult.status !== "success") {
    return null
  }

  const entries = entriesResult.data

  return (
    <div data-testid="feedback-section" className="space-y-2">
      <h3 className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
        Feedback
      </h3>
      {entries.length === 0 ? (
        <div className="text-xs text-muted-foreground py-1">No feedback yet</div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <FeedbackEntryItem
              key={entry._id}
              entry={entry}
              onResolve={handleResolve}
              onReopen={handleReopen}
            />
          ))}
        </ul>
      )}
      <AddFeedbackForm
        orchestrationId={orchestrationId}
        targetType={targetType}
        targetRef={targetRef}
      />
    </div>
  )
}
```

2. Run FeedbackSection tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx vitest run tina-web/src/components/__tests__/FeedbackSection.test.tsx 2>&1 | tail -20`

Expected: All FeedbackSection tests pass.

---

### Task 5: Write FeedbackSummarySection tests (TDD — tests first)

**Files:**
- `tina-web/src/components/__tests__/FeedbackSummarySection.test.tsx`

**Model:** opus

**review:** full

**Depends on:** 2

Write tests for the FeedbackSummarySection component.

**Steps:**

1. Create `tina-web/src/components/__tests__/FeedbackSummarySection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { FeedbackSummarySection } from "../FeedbackSummarySection"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

describe("FeedbackSummarySection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows loading state", () => {
    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("shows zero count when no blocking entries", () => {
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: { openAskForChangeCount: 0, entries: [] },
    })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("shows blocking count badge when entries exist", () => {
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: { openAskForChangeCount: 3, entries: [{}, {}, {}] },
    })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("renders with Feedback title", () => {
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: { openAskForChangeCount: 0, entries: [] },
    })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText("Feedback")).toBeInTheDocument()
  })
})
```

2. Run tests to confirm they fail:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx vitest run tina-web/src/components/__tests__/FeedbackSummarySection.test.tsx 2>&1 | tail -10`

Expected: Tests fail because `FeedbackSummarySection` component doesn't exist yet.

---

### Task 6: Implement FeedbackSummarySection component

**Files:**
- `tina-web/src/components/FeedbackSummarySection.tsx`

**Model:** opus

**review:** full

**Depends on:** 5

Create the FeedbackSummarySection component that shows a blocking badge/counter for open `ask_for_change` entries.

**Steps:**

1. Create `tina-web/src/components/FeedbackSummarySection.tsx`:

```tsx
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { BlockingFeedbackSummaryQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import { StatPanel } from "@/components/ui/stat-panel"

interface FeedbackSummarySectionProps {
  orchestrationId: string
}

export function FeedbackSummarySection({ orchestrationId }: FeedbackSummarySectionProps) {
  const result = useTypedQuery(BlockingFeedbackSummaryQuery, { orchestrationId })

  return (
    <StatPanel title="Feedback">
      {matchQueryResult(result, {
        loading: () => (
          <div className="text-[8px] text-muted-foreground animate-pulse">
            Loading feedback...
          </div>
        ),
        error: () => (
          <div className="text-[8px] text-red-500">Failed to load feedback</div>
        ),
        success: (summary) => (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Blocking changes requested:
            </span>
            <span
              className={`text-sm font-bold ${
                summary.openAskForChangeCount > 0
                  ? "text-yellow-400"
                  : "text-muted-foreground"
              }`}
            >
              {summary.openAskForChangeCount}
            </span>
          </div>
        ),
      })}
    </StatPanel>
  )
}
```

2. Run FeedbackSummarySection tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx vitest run tina-web/src/components/__tests__/FeedbackSummarySection.test.tsx 2>&1 | tail -20`

Expected: All FeedbackSummarySection tests pass.

---

### Task 7: Integrate FeedbackSection into TaskQuicklook and CommitQuicklook

**Files:**
- `tina-web/src/components/TaskQuicklook.tsx`
- `tina-web/src/components/CommitQuicklook.tsx`

**Model:** opus

**review:** full

**Depends on:** 4

Add the FeedbackSection component inside both quicklook dialogs. Both `TaskEvent` and `Commit` already carry `orchestrationId` via `orchestrationScopedDocumentFields`.

**Steps:**

1. In `tina-web/src/components/TaskQuicklook.tsx`, add the import at the top:

```ts
import { FeedbackSection } from "@/components/FeedbackSection"
```

Then add a new section before the closing `</QuicklookDialog>` tag (before line 95). Insert after the `blockedBy` section and before `</QuicklookDialog>`:

```tsx
      <section className={styles.section}>
        <FeedbackSection
          orchestrationId={task.orchestrationId}
          targetType="task"
          targetRef={task.taskId}
        />
      </section>
```

2. In `tina-web/src/components/CommitQuicklook.tsx`, add the import at the top:

```ts
import { FeedbackSection } from "@/components/FeedbackSection"
```

Then add a section inside the content div (before line 92, the `</div>` that closes `<div className="space-y-4">`):

```tsx
            <div className="pt-4 border-t border-border">
              <FeedbackSection
                orchestrationId={commit.orchestrationId}
                targetType="commit"
                targetRef={commit.sha}
              />
            </div>
```

3. Verify TypeScript compiles:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -5`

Expected: No type errors.

---

### Task 8: Integrate FeedbackSummarySection into RightPanel

**Files:**
- `tina-web/src/components/RightPanel.tsx`

**Model:** opus

**review:** full

**Depends on:** 6

Add the FeedbackSummarySection as a new section in the RightPanel stack, after ActionTimeline.

**Steps:**

1. Add the import at the top of `tina-web/src/components/RightPanel.tsx`:

```ts
import { FeedbackSummarySection } from "@/components/FeedbackSummarySection"
```

2. Add `<FeedbackSummarySection orchestrationId={detail._id} />` after `<ActionTimeline orchestrationId={detail._id} />` (after line 33) in the stack div:

```tsx
        <FeedbackSummarySection orchestrationId={detail._id} />
```

3. Verify TypeScript compiles:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -5`

Expected: No type errors.

---

### Task 9: Run full web test suite and fix regressions

**Files:**
- (any files needing fixes)

**Model:** opus

**review:** full

**Depends on:** 7, 8

Run the full tina-web test suite and the Convex test suite to ensure no regressions.

**Steps:**

1. Run tina-web tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx vitest run --project tina-web 2>&1 | tail -30`

Expected: All tests pass including the new FeedbackSection and FeedbackSummarySection tests.

2. Run Convex tests to ensure schema changes don't break existing tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npm test 2>&1 | tail -30`

Expected: All Convex tests pass.

3. Run TypeScript type check:

Run: `cd /Users/joshua/Projects/tina/.worktrees/feedback-fabric-v1 && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -10`

Expected: No type errors.

4. Fix any test failures or type errors found. Common issues to check:
   - RightPanel test may need to mock the new FeedbackSummarySection query. If so, add `"feedbackEntries.blockingSummary": querySuccess({ openAskForChangeCount: 0, entries: [] })` to the `installAppRuntimeQueryMock` states.
   - TaskQuicklook test may need to mock `useTypedQuery` and `useMutation` for the FeedbackSection. If so, add the necessary mocks.

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Create FeedbackEntry + BlockingFeedbackSummary schemas | 2 min |
| 2 | Add feedback query defs to queryDefs.ts | 3 min |
| 3 | Write FeedbackSection tests (TDD) | 5 min |
| 4 | Implement FeedbackSection component | 5 min |
| 5 | Write FeedbackSummarySection tests (TDD) | 3 min |
| 6 | Implement FeedbackSummarySection component | 3 min |
| 7 | Integrate FeedbackSection into quicklooks | 4 min |
| 8 | Integrate FeedbackSummarySection into RightPanel | 2 min |
| 9 | Run full test suite + fix regressions | 5 min |
| **Total** | | **~32 min** |

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
