# Mechanical Review Workbench Phase 6.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** ff14723f8b76f2b45c37352f1e33aba02859fdea

**Goal:** Address gaps from Phase 6 review: Phase 6 was never actually executed — the executor found stale pre-existing commits and did no work. This remediation implements the full phase 6 scope from scratch: Changes Tab with daemon data integration.

**Architecture:** Add `@tanstack/react-query` for daemon HTTP data fetching. New custom hooks (`useDiffFiles`, `useDiffFile`) wrap react-query behind a consistent loading/error/data pattern. The `ChangesTab` component composes a file sidebar, diff panel, thread markers, and inline commenting. Thread data comes from the existing Convex `ReviewThreadListQuery`. All daemon HTTP access goes through hooks — no inline `fetch()` in components.

**Phase context:** Phase 6 was planned but never executed. The `ReviewDetailPage` tab shell exists (Phase 4) with a placeholder "Changes tab — coming in Phase 6". Phase 3 built the daemon HTTP server with `GET /diff` (file list + stats), `GET /diff/file` (structured hunks), `GET /file` (content at ref). Phase 5 built `ChecksTab`. All Convex review infrastructure (queries, mutations, schemas) is in place.

**Issues to address:**
1. Install `@tanstack/react-query` and add `QueryClientProvider` to the app tree
2. Create daemon query hooks (`useDiffFiles`, `useDiffFile`) with tests
3. Build `ChangesTab` component with file sidebar, diff panel, thread markers, inline commenting, spring navigation
4. Wire `ChangesTab` into `ReviewDetailPage`, replacing the placeholder

**Files involved:**
- `tina-web/package.json` (edit — add @tanstack/react-query)
- `tina-web/src/main.tsx` (edit — wrap with QueryClientProvider)
- `tina-web/src/hooks/useDaemonQuery.ts` (new — daemon fetch + react-query hooks)
- `tina-web/src/hooks/__tests__/useDaemonQuery.test.ts` (new)
- `tina-web/src/components/ChangesTab.tsx` (new — file sidebar + diff panel + threads + commenting)
- `tina-web/src/components/ChangesTab.module.scss` (new)
- `tina-web/src/components/__tests__/ChangesTab.test.tsx` (new)
- `tina-web/src/components/ReviewDetailPage.tsx` (edit — wire ChangesTab)
- `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx` (edit)

---

## Phase Estimates

| Step | Estimated Minutes |
|------|-------------------|
| Task 1: Install @tanstack/react-query + QueryClientProvider | 3 |
| Task 2: Daemon query hooks (useDiffFiles, useDiffFile) + tests | 5 |
| Task 3: ChangesTab component — file sidebar, diff panel, thread markers, inline commenting, spring navigation | 10 |
| Task 4: Wire ChangesTab into ReviewDetailPage + update tests | 5 |
| **Total** | **23** |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 800 |

---

### Task 1: Install @tanstack/react-query and add QueryClientProvider

**Files:**
- `tina-web/package.json` (edit)
- `tina-web/src/main.tsx` (edit)

**Model:** haiku

**review:** spec-only

**Depends on:** none

**Steps:**

1. Install the dependency:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npm install @tanstack/react-query`
Expected: Package added to dependencies in package.json

2. Edit `tina-web/src/main.tsx` — add `QueryClientProvider` wrapping the app tree. Create a `QueryClient` with sensible defaults for daemon data:

Current file structure:
```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider } from "convex/react";
import { convex } from "./convex";
import { RuntimeProvider } from "./providers/RuntimeProvider";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <RuntimeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </RuntimeProvider>
    </ConvexProvider>
  </StrictMode>,
);
```

Add these imports at the top:
```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
```

Add a `queryClient` instance before the `createRoot` call:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})
```

Wrap the existing tree — `QueryClientProvider` goes inside `StrictMode` but outside `ConvexProvider`:
```typescript
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConvexProvider client={convex}>
        <RuntimeProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </RuntimeProvider>
      </ConvexProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

3. Verify no type errors:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx tsc --noEmit 2>&1 | head -20`
Expected: No new type errors

---

### Task 2: Daemon query hooks (useDiffFiles, useDiffFile) with tests

**Files:**
- `tina-web/src/hooks/useDaemonQuery.ts` (new)
- `tina-web/src/hooks/__tests__/useDaemonQuery.test.ts` (new)

**Model:** opus

**review:** full

**Depends on:** Task 1

**Steps:**

1. Create `tina-web/src/hooks/useDaemonQuery.ts` with TypeScript types matching the daemon API (`tina-daemon/src/git.rs`) and two hooks:

```typescript
import { useQuery } from "@tanstack/react-query"

// Types matching tina-daemon/src/git.rs serialization
export type FileStatus = "added" | "modified" | "deleted" | "renamed"

export interface DiffFileStat {
  path: string
  status: FileStatus
  insertions: number
  deletions: number
  old_path: string | null
}

export type DiffLineKind = "context" | "add" | "delete"

export interface DiffLine {
  kind: DiffLineKind
  old_line: number | null
  new_line: number | null
  text: string
}

export interface DiffHunk {
  old_start: number
  old_count: number
  new_start: number
  new_count: number
  lines: DiffLine[]
}

const DAEMON_BASE = import.meta.env.VITE_DAEMON_URL ?? "http://localhost:4321"

export async function fetchDaemon<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, DAEMON_BASE)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const resp = await fetch(url.toString())
  if (!resp.ok) {
    throw new Error(`Daemon ${path}: ${resp.status} ${await resp.text()}`)
  }
  return resp.json() as Promise<T>
}

export function useDiffFiles(worktree: string, base: string) {
  return useQuery<DiffFileStat[]>({
    queryKey: ["daemon", "diff", worktree, base],
    queryFn: () => fetchDaemon<DiffFileStat[]>("/diff", { worktree, base }),
    enabled: !!worktree && !!base,
  })
}

export function useDiffFile(worktree: string, base: string, file: string) {
  return useQuery<DiffHunk[]>({
    queryKey: ["daemon", "diff", "file", worktree, base, file],
    queryFn: () => fetchDaemon<DiffHunk[]>("/diff/file", { worktree, base, file }),
    enabled: !!worktree && !!base && !!file,
  })
}
```

2. Create `tina-web/src/hooks/__tests__/useDaemonQuery.test.ts` testing the `fetchDaemon` helper:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchDaemon } from "../useDaemonQuery"

describe("fetchDaemon", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("constructs URL with base and params", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    )

    await fetchDaemon("/diff", { worktree: "/tmp/wt", base: "main" })

    const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string
    expect(calledUrl).toContain("/diff")
    expect(calledUrl).toContain("worktree=%2Ftmp%2Fwt")
    expect(calledUrl).toContain("base=main")
  })

  it("returns parsed JSON on success", async () => {
    const data = [{ path: "src/foo.ts", status: "modified", insertions: 5, deletions: 2, old_path: null }]
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200 }),
    )

    const result = await fetchDaemon("/diff", { worktree: "/tmp", base: "main" })
    expect(result).toEqual(data)
  })

  it("throws on non-ok response with status and body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("Missing worktree param", { status: 400 }),
    )

    await expect(fetchDaemon("/diff", {})).rejects.toThrow(
      "Daemon /diff: 400 Missing worktree param",
    )
  })
})
```

3. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- useDaemonQuery 2>&1 | tail -10`
Expected: All tests pass

---

### Task 3: ChangesTab component — file sidebar, diff panel, thread markers, inline commenting, spring navigation

**Files:**
- `tina-web/src/components/ChangesTab.tsx` (new)
- `tina-web/src/components/ChangesTab.module.scss` (new)
- `tina-web/src/components/__tests__/ChangesTab.test.tsx` (new)

**Model:** opus

**review:** full

**Depends on:** Task 2

**Steps:**

1. Create `tina-web/src/components/ChangesTab.module.scss`. Follow the existing SCSS pattern (import `_tokens.scss`, use `$bg-card`, `$border-color`, `$text-muted`, `$text-primary`, `$accent`, `$font-mono` variables):

```scss
@use '../styles/tokens' as *;

.changesLayout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 12px;
  min-height: 400px;
}

.sidebar {
  border: 1px solid $border-color;
  border-radius: 6px;
  background: $bg-card;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.filterInput {
  padding: 8px;
  border-bottom: 1px solid $border-color;

  input {
    width: 100%;
    padding: 6px 8px;
    font-size: 12px;
    border: 1px solid $border-color;
    border-radius: 4px;
    background: $bg-primary;
    color: $text-primary;
    outline: none;
    &:focus { border-color: $accent; }
  }
}

.fileList {
  flex: 1;
  overflow-y: auto;
  max-height: 68vh;
}

.fileItem {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  font-size: 12px;
  color: $text-muted;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;

  &:hover { background: rgba(255, 255, 255, 0.03); color: $text-primary; }
  &.selected { background: rgba(255, 255, 255, 0.06); color: $text-primary; }
}

.fileMarker {
  width: 14px;
  text-align: center;
  font-size: 11px;
  flex-shrink: 0;
}

.fileName {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fileStats {
  font-size: 10px;
  color: $text-muted;
  flex-shrink: 0;
}

.diffPanel {
  border: 1px solid $border-color;
  border-radius: 6px;
  background: $bg-card;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.diffHeader {
  padding: 8px 12px;
  border-bottom: 1px solid $border-color;
  font-size: 12px;
}

.diffFilePath {
  font-weight: 600;
  color: $text-primary;
  font-family: $font-mono;
}

.diffStats {
  font-size: 11px;
  color: $text-muted;
  margin-top: 2px;
}

.diffScroll {
  flex: 1;
  overflow: auto;
  max-height: 68vh;
}

.diffTable {
  width: 100%;
  border-collapse: collapse;
  font-family: $font-mono;
  font-size: 12px;
  line-height: 20px;
}

.diffGutter {
  width: 48px;
  padding: 0 6px;
  text-align: right;
  color: $text-muted;
  user-select: none;
  font-size: 11px;
  vertical-align: top;
}

.diffSep {
  width: 1px;
  background: $border-color;
}

.diffCode {
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
  vertical-align: top;
}

.lineAdd { background: rgba(46, 160, 67, 0.08); }
.lineDelete { background: rgba(248, 81, 73, 0.08); }
.lineContext { background: transparent; }

.commentBtn {
  width: 18px;
  height: 18px;
  border: 1px solid $border-color;
  border-radius: 3px;
  background: $bg-card;
  color: $text-muted;
  font-size: 10px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s;

  tr:hover & { opacity: 1; }
  &:hover { border-color: $accent; color: $accent; }
}

.commentBtnCell {
  width: 24px;
  text-align: center;
  vertical-align: top;
  padding: 1px 2px;
}

.threadMarker {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.threadMarkerP0 { background: hsl(var(--status-blocked)); }
.threadMarkerP1 { background: hsl(var(--status-reviewing)); }
.threadMarkerP2 { background: $text-muted; }

.emptyState {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: $text-muted;
  font-size: 13px;
}

.springIndicator {
  padding: 8px 12px;
  border-top: 1px solid $border-color;
  font-size: 11px;
  color: $text-muted;
}

.springBar {
  height: 3px;
  border-radius: 2px;
  background: $border-color;
  margin-top: 4px;
  overflow: hidden;
}

.springFill {
  height: 100%;
  border-radius: 2px;
  background: $accent;
  transition: width 0.05s;
}

.inlineComposer {
  padding: 8px;
  border-top: 1px solid $border-color;
  background: $bg-card;
}

.inlineComposerTarget {
  font-size: 11px;
  color: $text-muted;
  margin-bottom: 4px;
  font-family: $font-mono;
}

.inlineComposerTextarea {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid $border-color;
  border-radius: 4px;
  background: $bg-primary;
  color: $text-primary;
  resize: vertical;
  min-height: 60px;
  outline: none;
  &:focus { border-color: $accent; }
}

.inlineComposerActions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.inlineComposerSubmit {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid $border-color;
  border-radius: 4px;
  background: $bg-card;
  color: $text-primary;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { border-color: $accent; }
}

.inlineComposerCancel {
  padding: 4px 10px;
  font-size: 11px;
  border: 1px solid $border-color;
  border-radius: 4px;
  background: none;
  color: $text-muted;
  cursor: pointer;
}

.fileComments {
  padding: 8px 12px;
  border-top: 1px solid $border-color;
}

.fileCommentsTitle {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.threadCard {
  border: 1px solid $border-color;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 6px;
}

.threadMeta {
  font-size: 11px;
  color: $text-muted;
}

.threadSummary {
  font-size: 12px;
  font-weight: 600;
  color: $text-primary;
  margin-top: 2px;
}

.threadBody {
  font-size: 12px;
  color: $text-muted;
  margin-top: 2px;
}
```

2. Create `tina-web/src/components/ChangesTab.tsx`. The component is structured as:

- `ChangesTabProps`: `reviewId`, `orchestrationId`, `worktreePath`, `baseBranch`, `initialFile?`
- `FileSidebar` subcomponent: file filter input + scrollable file list with status markers (+/-/~) and stats
- `DiffTable` subcomponent: renders hunks with old/new gutters, code, comment buttons, thread marker dots
- `FileCommentsSection` subcomponent: lists review threads for the selected file
- `ChangesTab` main: state for selectedPath, fileFilter, commentTarget, commentBody, spring progress. Uses `useDiffFiles`, `useDiffFile` from `useDaemonQuery` and `useTypedQuery(ReviewThreadListQuery)` for threads. Handles spring-to-next-file via overscroll detection on the diff scroll container.

Key implementation details:
- Auto-select first file when none selected: `const effectivePath = selectedPath || files[0]?.path || ""`
- `initialFile` prop sets initial `selectedPath` state
- Thread markers: build `Map<number, ReviewThread[]>` from threads matching current file's `filePath`, key on `line`. Show colored dot (P0=blocked color, P1=reviewing color, P2=muted) in new-line gutter.
- Inline commenting: clicking `+` button sets `commentTarget` with side/line. Composer textarea below diff. Submit calls `useMutation(api.reviewThreads.createThread)` with `severity: "p2"`, `source: "human"`, `author: "human"`.
- Spring navigation: track `{ direction: "next"|"prev"|null, progress: number }`. On wheel event when at scroll boundary, accumulate `progress`. At `SPRING_THRESHOLD` (170), call `jumpAdjacent`. Progress bar shown in `springIndicator` div.

The complete component implementation follows the code structure in the original phase 6 plan (lines 519-953 of the existing phase-6 plan file) with these corrections:
- Remove the buggy `?.let` in diffStats — use a clean IIFE: `{(() => { const f = files.find(fi => fi.path === effectivePath); return f ? \`+${f.insertions} -${f.deletions}\` : "" })()}`
- Thread marker class lookup uses severity directly: `styles[\`threadMarker\${severity.charAt(0).toUpperCase() + severity.slice(1)}\`]` maps "p0" → `threadMarkerP0`, "p1" → `threadMarkerP1`, "p2" → `threadMarkerP2`
- `reviewId` and `orchestrationId` are cast to `Id<"reviews">` and `Id<"orchestrations">` when calling `createThread`

3. Create `tina-web/src/components/__tests__/ChangesTab.test.tsx` following the `ChecksTab.test.tsx` pattern:

Mock setup:
```typescript
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useDaemonQuery")
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return { ...mod, useMutation: vi.fn(() => vi.fn()) }
})
```

Use `vi.mocked(await import("@/hooks/useDaemonQuery"))` to get `useDiffFiles` and `useDiffFile` mocks. Return react-query-shaped objects: `{ data, isLoading, isError }`.

Tests to write:
- Shows loading state when `useDiffFiles` returns `{ isLoading: true, isError: false, data: undefined }`
- Shows error state when `useDiffFiles` returns `{ isLoading: false, isError: true, data: undefined }`
- Shows empty state when `useDiffFiles` returns `{ data: [], isLoading: false, isError: false }`
- Renders file sidebar with file items (check testid `file-sidebar`, `file-item`)
- First file auto-selected when no `initialFile`
- `initialFile` prop pre-selects the specified file
- File filter narrows sidebar list
- Renders diff table with hunks when file selected (testid `diff-table`)
- Thread markers appear on lines with matching threads
- Shows per-file comments section with threads for selected file (testid `file-comments`)
- Clicking comment button opens inline composer (testid `inline-composer`)
- Submitting inline comment calls `createThread` mutation
- Cancel button closes inline composer

Use `buildReviewThread` from `@/test/builders/domain/entities` for thread fixtures.

4. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- ChangesTab 2>&1 | tail -10`
Expected: All tests pass

---

### Task 4: Wire ChangesTab into ReviewDetailPage and update tests

**Files:**
- `tina-web/src/components/ReviewDetailPage.tsx` (edit)
- `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx` (edit)

**Model:** opus

**review:** full

**Depends on:** Task 3

**Steps:**

1. Edit `tina-web/src/components/ReviewDetailPage.tsx`:

Add import:
```typescript
import { Option } from "effect"
import { ChangesTab } from "./ChangesTab"
import { OrchestrationDetailQuery } from "@/services/data/queryDefs"
```

Note: `Option` is already imported. `OrchestrationDetailQuery` is already defined in `queryDefs.ts`.

Inside `ReviewDetailContent`, add an orchestration detail query after the existing queries:
```typescript
const orchResult = useTypedQuery(OrchestrationDetailQuery, {
  orchestrationId: orchestrationId ?? "",
})
```

Replace the Changes tab placeholder (lines 157-160):
```typescript
// BEFORE:
{activeTab === "changes" && (
  <div className={styles.placeholder}>
    Changes tab — coming in Phase 6
  </div>
)}

// AFTER:
{activeTab === "changes" && orchResult.status === "success" && orchResult.data && (
  <ChangesTab
    reviewId={reviewId ?? ""}
    orchestrationId={orchestrationId ?? ""}
    worktreePath={Option.getOrElse(orchResult.data.worktreePath, () => "")}
    baseBranch={orchResult.data.branch}
  />
)}
```

Note: `orchResult.data.worktreePath` is `Option<string>` (from the `optionalString` schema). Use `Option.getOrElse` to extract the string value, falling back to empty string if none.

2. Edit `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx`:

Add a mock for `ChangesTab`:
```typescript
vi.mock("../ChangesTab", () => ({
  ChangesTab: () => <div data-testid="changes-tab">ChangesTab</div>,
}))
```

Import `buildOrchestrationDetail` from `@/test/builders/domain/fixtures` and `some` from `@/test/builders/domain/primitives`.

Update the existing "shows placeholder when switching to Changes tab" test to instead verify:
```typescript
it("shows ChangesTab when switching to Changes tab", async () => {
  const user = userEvent.setup()
  installAppRuntimeQueryMock(mockUseTypedQuery, {
    states: {
      "reviews.detail": querySuccess(buildReviewSummary()),
      "reviewGates.list": querySuccess([]),
      "orchestrations.detail": querySuccess(
        buildOrchestrationDetail({
          worktreePath: some("/tmp/worktree"),
          branch: "tina/my-feature",
        }),
      ),
    },
  })

  renderPage()

  await user.click(screen.getByText("Changes"))
  expect(screen.getByTestId("changes-tab")).toBeInTheDocument()
  expect(screen.queryByTestId("conversation-tab")).not.toBeInTheDocument()
})
```

Also update other tests that use `installAppRuntimeQueryMock` to include the `"orchestrations.detail"` state, since the `ReviewDetailContent` now queries it. Use `querySuccess(buildOrchestrationDetail())` as the default.

3. Run all tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- ReviewDetailPage 2>&1 | tail -10`
Expected: All tests pass

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts 2>&1 | tail -10`
Expected: Full test suite passes

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors

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
