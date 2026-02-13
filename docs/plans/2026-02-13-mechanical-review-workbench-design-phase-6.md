# Mechanical Review Workbench Phase 6: Web UI — Changes

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** 83746c80c8cd0a3c05251ce615778e119a499f5d

**Goal:** Build the Changes tab in the review detail page — a side-by-side diff viewer powered by the daemon HTTP server (`GET /diff` and `GET /diff/file`), with file sidebar, thread marker overlay from Convex subscriptions, inline line commenting, spring-to-next-file navigation on overscroll, and per-file comments section.

**Architecture:** Add `@tanstack/react-query` for daemon HTTP data fetching. New custom hooks (`useDiffFiles`, `useDiffFile`) wrap react-query behind the same loading/error/data pattern used by `useTypedQuery`. The `ChangesTab` component composes a file sidebar, diff panel, thread markers, and inline commenting — closely following the interactive wireframe prototype at `designs/src/designSets/project4-mechanical-review-workbench/index.tsx`. Thread data comes from the existing Convex `ReviewThreadListQuery`. All daemon HTTP access goes through hooks — no inline `fetch()` in components.

**Phase context:** Phase 3 built the daemon HTTP server with three endpoints: `GET /diff` (file list + stats), `GET /diff/file` (structured hunks per file), `GET /file` (content at ref). The daemon returns `DiffFileStat` (path, status, insertions, deletions, old_path) and `DiffHunk` (old_start, old_count, new_start, new_count, lines: DiffLine[]). Phase 4 built the `ReviewDetailPage` tab shell, `ConversationTab`, and review query infrastructure. Phase 5 built `ChecksTab`. The Changes tab placeholder currently says "Changes tab — coming in Phase 6".

**Files involved:**
- `tina-web/package.json` (edit — add @tanstack/react-query)
- `tina-web/src/main.tsx` (edit — wrap with QueryClientProvider)
- `tina-web/src/hooks/useDaemonQuery.ts` (new — daemon fetch + react-query hook)
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
| Task 3: ChangesTab component — file sidebar + diff panel | 8 |
| Task 4: Thread markers + inline commenting + spring navigation | 8 |
| Task 5: Wire ChangesTab into ReviewDetailPage + update tests | 3 |
| **Total** | **27** |

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

2. Edit `tina-web/src/main.tsx` to wrap the app with `QueryClientProvider`. Create a `QueryClient` with sensible defaults (staleTime 30s for daemon data, no refetch on window focus since diffs are computed):

Read `tina-web/src/main.tsx`, then wrap the app tree with:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})
```

Wrap the existing `<ConvexProvider>` tree inside `<QueryClientProvider client={queryClient}>`.

3. Verify:

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

1. Create `tina-web/src/hooks/useDaemonQuery.ts` with TypeScript types matching the daemon API and two hooks:

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

async function fetchDaemon<T>(path: string, params: Record<string, string>): Promise<T> {
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

2. Create `tina-web/src/hooks/__tests__/useDaemonQuery.test.ts` testing the `fetchDaemon` helper (export it for testing) and hook behavior:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Test fetchDaemon directly (export as _fetchDaemon for testing)
// Mock global fetch
// Test: successful response returns parsed JSON
// Test: non-ok response throws with status and body text
// Test: URL construction with params
// Test: VITE_DAEMON_URL defaults to localhost:4321
```

Keep tests focused on the fetch utility function. Hook integration is tested via component tests in Task 3.

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- useDaemonQuery 2>&1 | tail -10`
Expected: All tests pass

---

### Task 3: ChangesTab component — file sidebar and diff panel

**Files:**
- `tina-web/src/components/ChangesTab.tsx` (new)
- `tina-web/src/components/ChangesTab.module.scss` (new)
- `tina-web/src/components/__tests__/ChangesTab.test.tsx` (new)

**Model:** opus

**review:** full

**Depends on:** Task 2

**Steps:**

1. Create `tina-web/src/components/ChangesTab.module.scss` with styles for the two-column layout (file sidebar on left, diff panel on right). Follow the wireframe pattern:

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

// Thread marker on diff line
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

2. Create `tina-web/src/components/ChangesTab.tsx`. This is the main component. Structure it as:

```typescript
import { useState, useRef, useMemo, useCallback } from "react"
import type { WheelEvent } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ReviewThreadListQuery } from "@/services/data/queryDefs"
import { matchQueryResult } from "@/lib/query-state"
import { useDiffFiles, useDiffFile } from "@/hooks/useDaemonQuery"
import type { DiffFileStat, DiffHunk, DiffLine } from "@/hooks/useDaemonQuery"
import type { ReviewThread } from "@/schemas"
import styles from "./ChangesTab.module.scss"

interface ChangesTabProps {
  reviewId: string
  orchestrationId: string
  worktreePath: string
  baseBranch: string
}

const SPRING_THRESHOLD = 170

// --- File sidebar ---
function FileSidebar({
  files,
  selectedPath,
  onSelect,
  filter,
  onFilterChange,
}: {
  files: DiffFileStat[]
  selectedPath: string
  onSelect: (path: string) => void
  filter: string
  onFilterChange: (v: string) => void
}) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return files
    return files.filter((f) => f.path.toLowerCase().includes(q))
  }, [files, filter])

  const marker = (status: string) =>
    status === "added" ? "+" : status === "deleted" ? "-" : "~"

  return (
    <aside className={styles.sidebar} data-testid="file-sidebar">
      <div className={styles.filterInput}>
        <input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter files..."
          aria-label="Filter files"
        />
      </div>
      <div className={styles.fileList}>
        {filtered.map((file) => (
          <button
            key={file.path}
            className={`${styles.fileItem} ${file.path === selectedPath ? styles.selected : ""}`}
            onClick={() => onSelect(file.path)}
            data-testid="file-item"
          >
            <span className={styles.fileMarker}>{marker(file.status)}</span>
            <span className={styles.fileName}>{file.path}</span>
            <span className={styles.fileStats}>
              +{file.insertions} -{file.deletions}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className={styles.emptyState}>No matching files</div>
        )}
      </div>
    </aside>
  )
}

// --- Diff table ---
function DiffTable({
  hunks,
  threads,
  onLineComment,
}: {
  hunks: DiffHunk[]
  threads: ReviewThread[]
  onLineComment: (side: "old" | "new", line: number) => void
}) {
  // Build thread map: line → threads (match on new_line)
  const threadsByLine = useMemo(() => {
    const map = new Map<number, ReviewThread[]>()
    for (const t of threads) {
      const existing = map.get(t.line) ?? []
      existing.push(t)
      map.set(t.line, existing)
    }
    return map
  }, [threads])

  const lineClass = (kind: string) => {
    if (kind === "add") return styles.lineAdd
    if (kind === "delete") return styles.lineDelete
    return styles.lineContext
  }

  return (
    <table className={styles.diffTable} data-testid="diff-table">
      <tbody>
        {hunks.flatMap((hunk) =>
          hunk.lines.map((line, i) => {
            const key = `${hunk.old_start}-${hunk.new_start}-${i}`
            const rowThreads = line.new_line ? threadsByLine.get(line.new_line) : undefined
            return (
              <tr key={key} className={lineClass(line.kind)}>
                <td className={styles.commentBtnCell}>
                  {line.old_line != null && (
                    <button
                      className={styles.commentBtn}
                      onClick={() => onLineComment("old", line.old_line!)}
                      aria-label={`Comment on old line ${line.old_line}`}
                    >
                      +
                    </button>
                  )}
                </td>
                <td className={styles.diffGutter}>{line.old_line ?? ""}</td>
                <td className={styles.diffSep} />
                <td className={styles.commentBtnCell}>
                  {line.new_line != null && (
                    <button
                      className={styles.commentBtn}
                      onClick={() => onLineComment("new", line.new_line!)}
                      aria-label={`Comment on new line ${line.new_line}`}
                    >
                      +
                    </button>
                  )}
                </td>
                <td className={styles.diffGutter}>
                  {rowThreads && rowThreads.length > 0 && (
                    <span
                      className={`${styles.threadMarker} ${styles[`threadMarker${rowThreads[0].severity.toUpperCase()}`] ?? styles.threadMarkerP2}`}
                      title={`${rowThreads.length} finding(s)`}
                    />
                  )}
                  {line.new_line ?? ""}
                </td>
                <td className={styles.diffCode}>{line.text || " "}</td>
              </tr>
            )
          }),
        )}
      </tbody>
    </table>
  )
}

// --- Per-file comments section ---
function FileCommentsSection({ threads }: { threads: ReviewThread[] }) {
  if (threads.length === 0) return null

  return (
    <div className={styles.fileComments} data-testid="file-comments">
      <div className={styles.fileCommentsTitle}>Comments for this file</div>
      {threads.map((thread) => (
        <div key={thread._id} className={styles.threadCard}>
          <div className={styles.threadMeta}>
            {thread.author} | {thread.filePath}:{thread.line} | {thread.severity}
          </div>
          <div className={styles.threadSummary}>{thread.summary}</div>
          <div className={styles.threadBody}>{thread.body}</div>
        </div>
      ))}
    </div>
  )
}

// --- Main ChangesTab ---
export function ChangesTab({
  reviewId,
  orchestrationId,
  worktreePath,
  baseBranch,
}: ChangesTabProps) {
  const [selectedPath, setSelectedPath] = useState("")
  const [fileFilter, setFileFilter] = useState("")
  const [commentTarget, setCommentTarget] = useState<{
    side: "old" | "new"
    line: number
  } | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [spring, setSpring] = useState<{
    direction: "next" | "prev" | null
    progress: number
  }>({ direction: null, progress: 0 })
  const diffScrollRef = useRef<HTMLDivElement | null>(null)

  const createThread = useMutation(api.reviewThreads.createThread)
  const filesQuery = useDiffFiles(worktreePath, baseBranch)
  const threadsResult = useTypedQuery(ReviewThreadListQuery, { reviewId })

  const files = filesQuery.data ?? []

  // Auto-select first file if none selected
  const effectivePath = selectedPath || files[0]?.path || ""
  const hunksQuery = useDiffFile(worktreePath, baseBranch, effectivePath)

  // Filtered files for navigation
  const filteredFiles = useMemo(() => {
    const q = fileFilter.trim().toLowerCase()
    if (!q) return files
    return files.filter((f) => f.path.toLowerCase().includes(q))
  }, [files, fileFilter])

  const navFiles = filteredFiles.length > 0 ? filteredFiles : files

  const currentIndex = useMemo(
    () => navFiles.findIndex((f) => f.path === effectivePath),
    [navFiles, effectivePath],
  )

  // Threads for current file
  const fileThreads = useMemo(() => {
    if (threadsResult.status !== "success" || !threadsResult.data) return []
    return threadsResult.data.filter((t) => t.filePath === effectivePath)
  }, [threadsResult, effectivePath])

  const selectFile = useCallback(
    (path: string) => {
      setSelectedPath(path)
      setCommentTarget(null)
      setCommentBody("")
      setSpring({ direction: null, progress: 0 })
      requestAnimationFrame(() => {
        if (diffScrollRef.current) diffScrollRef.current.scrollTop = 0
      })
    },
    [],
  )

  const jumpAdjacent = useCallback(
    (direction: "next" | "prev"): boolean => {
      if (currentIndex < 0) return false
      const idx = direction === "next" ? currentIndex + 1 : currentIndex - 1
      const target = navFiles[idx]
      if (!target) return false
      selectFile(target.path)
      return true
    },
    [currentIndex, navFiles, selectFile],
  )

  const handleDiffWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const viewport = diffScrollRef.current
      if (!viewport || event.deltaY === 0) return

      const atBottom =
        viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2
      const atTop = viewport.scrollTop <= 2
      const direction: "next" | "prev" = event.deltaY > 0 ? "next" : "prev"
      const overscrolling =
        (direction === "next" && atBottom) || (direction === "prev" && atTop)

      if (!overscrolling) {
        if (spring.direction !== null) setSpring({ direction: null, progress: 0 })
        return
      }

      event.preventDefault()
      const base = spring.direction === direction ? spring.progress : 0
      const progress = Math.min(SPRING_THRESHOLD, base + Math.abs(event.deltaY))

      if (progress >= SPRING_THRESHOLD) {
        const moved = jumpAdjacent(direction)
        setSpring(
          moved
            ? { direction: null, progress: 0 }
            : { direction, progress: SPRING_THRESHOLD },
        )
        return
      }
      setSpring({ direction, progress })
    },
    [spring, jumpAdjacent],
  )

  const handleLineComment = useCallback(
    (side: "old" | "new", line: number) => {
      setCommentTarget({ side, line })
      setCommentBody("")
    },
    [],
  )

  const submitLineComment = useCallback(async () => {
    const trimmed = commentBody.trim()
    if (!commentTarget || !trimmed) return

    setCommentSubmitting(true)
    try {
      await createThread({
        reviewId: reviewId as Id<"reviews">,
        orchestrationId: orchestrationId as Id<"orchestrations">,
        filePath: effectivePath,
        line: commentTarget.line,
        commitSha: "",
        summary: trimmed.split("\n")[0] ?? trimmed,
        body: trimmed,
        severity: "p2",
        source: "human",
        author: "human",
        gateImpact: "review",
      })
      setCommentTarget(null)
      setCommentBody("")
    } finally {
      setCommentSubmitting(false)
    }
  }, [commentTarget, commentBody, createThread, reviewId, orchestrationId, effectivePath])

  // Loading states
  if (filesQuery.isLoading) {
    return <div className={styles.emptyState} data-testid="changes-loading">Loading changed files...</div>
  }
  if (filesQuery.isError) {
    return <div className={styles.emptyState} data-testid="changes-error">Failed to load diff from daemon</div>
  }
  if (files.length === 0) {
    return <div className={styles.emptyState} data-testid="changes-empty">No changed files</div>
  }

  const nextFile = currentIndex >= 0 && currentIndex < navFiles.length - 1 ? navFiles[currentIndex + 1] : null
  const prevFile = currentIndex > 0 ? navFiles[currentIndex - 1] : null

  return (
    <div className={styles.changesLayout} data-testid="changes-tab">
      <FileSidebar
        files={files}
        selectedPath={effectivePath}
        onSelect={selectFile}
        filter={fileFilter}
        onFilterChange={setFileFilter}
      />

      <div className={styles.diffPanel}>
        <div className={styles.diffHeader}>
          <div className={styles.diffFilePath}>{effectivePath}</div>
          <div className={styles.diffStats}>
            {files.find((f) => f.path === effectivePath)?.let ?? ""}
            {(() => {
              const f = files.find((f) => f.path === effectivePath)
              return f ? `+${f.insertions} -${f.deletions}` : ""
            })()}
          </div>
        </div>

        <div
          ref={diffScrollRef}
          onWheel={handleDiffWheel}
          className={styles.diffScroll}
        >
          {hunksQuery.isLoading && (
            <div className={styles.emptyState}>Loading diff...</div>
          )}
          {hunksQuery.isError && (
            <div className={styles.emptyState}>Failed to load file diff</div>
          )}
          {hunksQuery.data && (
            <DiffTable
              hunks={hunksQuery.data}
              threads={fileThreads}
              onLineComment={handleLineComment}
            />
          )}
        </div>

        {spring.direction && (
          <div className={styles.springIndicator} data-testid="spring-indicator">
            {spring.direction === "next"
              ? nextFile
                ? `Keep scrolling to jump to ${nextFile.path}`
                : "No next file"
              : prevFile
                ? `Keep scrolling to jump to ${prevFile.path}`
                : "No previous file"}
            <div className={styles.springBar}>
              <div
                className={styles.springFill}
                style={{ width: `${(spring.progress / SPRING_THRESHOLD) * 100}%` }}
              />
            </div>
          </div>
        )}

        {commentTarget && (
          <div className={styles.inlineComposer} data-testid="inline-composer">
            <div className={styles.inlineComposerTarget}>
              {commentTarget.side} line {commentTarget.line}
            </div>
            <textarea
              className={styles.inlineComposerTextarea}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Write an inline comment..."
              aria-label="Inline comment"
            />
            <div className={styles.inlineComposerActions}>
              <button
                className={styles.inlineComposerSubmit}
                onClick={submitLineComment}
                disabled={!commentBody.trim() || commentSubmitting}
              >
                {commentSubmitting ? "Submitting..." : "Add comment"}
              </button>
              <button
                className={styles.inlineComposerCancel}
                onClick={() => {
                  setCommentTarget(null)
                  setCommentBody("")
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <FileCommentsSection threads={fileThreads} />
      </div>
    </div>
  )
}
```

Note: The `diffStats` rendering has a bug above (`?.let`). The implementer should write it correctly as:
```typescript
<div className={styles.diffStats}>
  {(() => {
    const f = files.find((file) => file.path === effectivePath)
    return f ? `+${f.insertions} -${f.deletions}` : ""
  })()}
</div>
```

3. Create `tina-web/src/components/__tests__/ChangesTab.test.tsx` following the ChecksTab test pattern:

Tests to write:
- Shows loading state when daemon query is loading
- Shows error state when daemon query fails
- Shows empty state when no changed files
- Renders file sidebar with file items
- Selects first file by default
- File filter narrows sidebar list
- Clicking a file selects it and fetches its diff
- Renders diff table with hunks when file is selected
- Thread markers appear on lines with findings
- Shows per-file comments section with threads
- Clicking comment button opens inline composer
- Submitting inline comment calls createThread mutation
- Cancel closes inline composer

Mock `useDiffFiles` and `useDiffFile` from `@/hooks/useDaemonQuery`. Mock `useTypedQuery` for threads. Mock `useMutation` for createThread.

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- ChangesTab 2>&1 | tail -10`
Expected: All tests pass

---

### Task 4: Spring navigation and review integration refinements

**Files:**
- `tina-web/src/components/ChangesTab.tsx` (edit)
- `tina-web/src/components/__tests__/ChangesTab.test.tsx` (edit)

**Model:** opus

**review:** full

**Depends on:** Task 3

**Steps:**

1. Add spring navigation tests to `ChangesTab.test.tsx`:
- Spring indicator appears when at bottom of diff and scrolling down
- Spring progress fills as user continues scrolling
- File switches when spring threshold is reached
- Spring resets when scrolling back

2. Add a test for the file:line click-to-navigate feature referenced in the design doc's Conversation tab section ("Clicking a file:line reference switches to Changes tab and scrolls to that line"). This is wired at the `ReviewDetailPage` level (Task 5), but the `ChangesTab` should accept an optional `initialFile` prop and select it on mount:

Add `initialFile?: string` to `ChangesTabProps`. In the component, use it as the initial `selectedPath` state:

```typescript
const [selectedPath, setSelectedPath] = useState(initialFile ?? "")
```

3. Add test that `initialFile` prop pre-selects the right file.

4. Verify all passing:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- ChangesTab 2>&1 | tail -10`
Expected: All tests pass

---

### Task 5: Wire ChangesTab into ReviewDetailPage and update tests

**Files:**
- `tina-web/src/components/ReviewDetailPage.tsx` (edit)
- `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx` (edit)

**Model:** opus

**review:** full

**Depends on:** Task 4

**Steps:**

1. Edit `tina-web/src/components/ReviewDetailPage.tsx`:

Replace the Changes tab placeholder with the `ChangesTab` component. The `ChangesTab` needs `worktreePath` and `baseBranch` which are available from the orchestration context. For now, get them from the review's orchestration detail (the orchestration has `worktreePath` and `branch` fields). Add a `useTypedQuery` call for the `OrchestrationDetailQuery` to get this data:

```typescript
import { ChangesTab } from "./ChangesTab"

// Inside ReviewDetailContent, add:
const orchResult = useTypedQuery(OrchestrationDetailQuery, {
  orchestrationId: orchestrationId ?? "",
})

// Then in the tab content, replace the placeholder:
{activeTab === "changes" && orchResult.status === "success" && orchResult.data && (
  <ChangesTab
    reviewId={reviewId ?? ""}
    orchestrationId={orchestrationId ?? ""}
    worktreePath={orchResult.data.worktreePath}
    baseBranch={orchResult.data.branch}
  />
)}
```

Add the import for `OrchestrationDetailQuery` from `@/services/data/queryDefs`.

2. Edit `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx`:

Add a test that verifies:
- Changes tab renders `ChangesTab` component (not the placeholder)
- Mock the orchestration detail query to return worktreePath and branch

Update existing mock setup to include orchestration detail state.

3. Verify all tests pass:

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
