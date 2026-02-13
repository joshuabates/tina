# Mechanical Review Workbench Phase 6.5.5 Remediation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** f9a08cfca067063a08d4aa5d15e67316509bf7e0

**Goal:** Implement the full Phase 6 scope from scratch. Two prior executor attempts found stale commits and did zero work. This plan includes explicit pre-flight checks to prove each artifact does NOT exist before creating it.

**Architecture:** Add `@tanstack/react-query` for daemon HTTP data fetching. Create `useDaemonQuery.ts` hooks (`useDiffFiles`, `useDiffFile`). Build `ChangesTab.tsx` with file sidebar, side-by-side diff panel, thread markers, inline commenting, and spring-to-next-file navigation. Wire it into `ReviewDetailPage.tsx` replacing the placeholder.

**Phase context:** The `ReviewDetailPage` has a placeholder div saying "Changes tab — coming in Phase 6". The daemon HTTP server (Phase 3) provides `GET /diff`, `GET /diff/file`, `GET /file`. `ChecksTab` and `ConversationTab` already exist. `@tanstack/react-query` is NOT installed. No `useDaemonQuery.ts`, `ChangesTab.tsx`, or `ChangesTab.module.scss` files exist.

**Issues to address:**
1. Install `@tanstack/react-query` and add `QueryClientProvider` to the app tree
2. Create daemon query hooks (`useDiffFiles`, `useDiffFile`) with tests
3. Build `ChangesTab` component with file sidebar, diff panel, thread markers, inline commenting, spring navigation
4. Wire `ChangesTab` into `ReviewDetailPage`, replacing the placeholder

**CRITICAL EXECUTOR INSTRUCTIONS:**
- Before each task, verify the target files DO NOT EXIST using `ls` or `cat`
- If you see a file already exists that you're supposed to create, it is STALE from a failed run. DELETE it and recreate from scratch
- Do NOT inspect git log to decide if work was "already done" — the prior executions FAILED
- Every task MUST produce new git commits. If a task produces zero commits, something is wrong.

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
| Task 2: Daemon query hooks + tests | 5 |
| Task 3: ChangesTab component + styles + tests | 12 |
| Task 4: Wire ChangesTab into ReviewDetailPage + update tests | 5 |
| **Total** | **25** |

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 900 |

---

### Task 1: Install @tanstack/react-query and add QueryClientProvider

**Files:**
- `tina-web/package.json` (edit)
- `tina-web/src/main.tsx` (edit)

**Model:** opus

**review:** spec-only

**Depends on:** none

**Steps:**

1. **Pre-flight check** — confirm react-query is NOT installed:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && grep "tanstack" package.json || echo "NOT INSTALLED - proceed"`
Expected: "NOT INSTALLED - proceed"

2. Install the dependency:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npm install @tanstack/react-query`
Expected: Package added to dependencies in package.json

3. Edit `tina-web/src/main.tsx` to add `QueryClientProvider`. The file currently looks like:

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

After editing, the file must be:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider } from "convex/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { convex } from "./convex";
import { RuntimeProvider } from "./providers/RuntimeProvider";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

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

4. Verify no type errors:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx tsc --noEmit 2>&1 | head -20`
Expected: No new type errors

5. Commit:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && git add tina-web/package.json tina-web/package-lock.json tina-web/src/main.tsx && git commit -m "feat: install @tanstack/react-query and add QueryClientProvider"`
Expected: Commit created successfully

---

### Task 2: Daemon query hooks (useDiffFiles, useDiffFile) with tests

**Files:**
- `tina-web/src/hooks/useDaemonQuery.ts` (new)
- `tina-web/src/hooks/__tests__/useDaemonQuery.test.ts` (new)

**Model:** opus

**review:** full

**Depends on:** Task 1

**Steps:**

1. **Pre-flight check** — confirm hook file does NOT exist:

Run: `ls /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web/src/hooks/useDaemonQuery.ts 2>&1 || echo "FILE DOES NOT EXIST - proceed"`
Expected: "FILE DOES NOT EXIST - proceed"

If the file DOES exist, delete it: `rm /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web/src/hooks/useDaemonQuery.ts`

2. Create `tina-web/src/hooks/useDaemonQuery.ts` with this exact content:

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

3. Create `tina-web/src/hooks/__tests__/useDaemonQuery.test.ts` with this exact content:

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

4. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- useDaemonQuery 2>&1 | tail -15`
Expected: 3 tests pass

5. Commit:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && git add tina-web/src/hooks/useDaemonQuery.ts tina-web/src/hooks/__tests__/useDaemonQuery.test.ts && git commit -m "feat: add useDaemonQuery hooks for daemon HTTP data fetching"`
Expected: Commit created successfully

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

1. **Pre-flight check** — confirm files do NOT exist:

Run: `ls /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web/src/components/ChangesTab.tsx 2>&1; ls /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web/src/components/ChangesTab.module.scss 2>&1; echo "CHECK COMPLETE"`
Expected: Both files not found, then "CHECK COMPLETE"

If either file exists, delete it and recreate from scratch.

2. Create `tina-web/src/components/ChangesTab.module.scss`:

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

3. Create `tina-web/src/components/ChangesTab.tsx`:

```tsx
import React, { useState, useRef, useCallback, useMemo } from "react"
import { useMutation } from "convex/react"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ReviewThreadListQuery } from "@/services/data/queryDefs"
import { useDiffFiles, useDiffFile } from "@/hooks/useDaemonQuery"
import type { DiffFileStat, DiffHunk, DiffLine } from "@/hooks/useDaemonQuery"
import type { ReviewThread } from "@/schemas"
import styles from "./ChangesTab.module.scss"

export interface ChangesTabProps {
  reviewId: string
  orchestrationId: string
  worktreePath: string
  baseBranch: string
  initialFile?: string
}

const STATUS_MARKERS: Record<string, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
}

const SPRING_THRESHOLD = 170

interface CommentTarget {
  line: number
  side: "old" | "new"
}

function FileSidebar({
  files,
  selectedPath,
  filter,
  onFilterChange,
  onSelect,
}: {
  files: DiffFileStat[]
  selectedPath: string
  filter: string
  onFilterChange: (v: string) => void
  onSelect: (path: string) => void
}) {
  const filtered = filter
    ? files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase()))
    : files

  return (
    <div className={styles.sidebar} data-testid="file-sidebar">
      <div className={styles.filterInput}>
        <input
          placeholder="Filter files..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label="Filter files"
        />
      </div>
      <div className={styles.fileList}>
        {filtered.map((file) => (
          <button
            key={file.path}
            data-testid="file-item"
            className={`${styles.fileItem} ${file.path === selectedPath ? styles.selected : ""}`}
            onClick={() => onSelect(file.path)}
          >
            <span className={styles.fileMarker}>
              {STATUS_MARKERS[file.status] ?? "?"}
            </span>
            <span className={styles.fileName}>{file.path}</span>
            <span className={styles.fileStats}>
              +{file.insertions} -{file.deletions}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ThreadMarkerDot({ severity }: { severity: string }) {
  const cls =
    severity === "p0"
      ? styles.threadMarkerP0
      : severity === "p1"
        ? styles.threadMarkerP1
        : styles.threadMarkerP2
  return <span className={`${styles.threadMarker} ${cls}`} data-testid="thread-marker" />
}

function DiffRow({
  line,
  threadsOnLine,
  onComment,
}: {
  line: DiffLine
  threadsOnLine: ReviewThread[]
  onComment: (target: CommentTarget) => void
}) {
  const rowClass =
    line.kind === "add"
      ? styles.lineAdd
      : line.kind === "delete"
        ? styles.lineDelete
        : styles.lineContext

  const newLine = line.new_line
  const commentSide = line.kind === "delete" ? "old" : "new"
  const commentLine = line.kind === "delete" ? line.old_line : newLine

  return (
    <tr className={rowClass}>
      <td className={styles.commentBtnCell}>
        {commentLine != null && (
          <button
            className={styles.commentBtn}
            onClick={() => onComment({ line: commentLine, side: commentSide })}
            aria-label={`Comment on line ${commentLine}`}
          >
            +
          </button>
        )}
      </td>
      <td className={styles.diffGutter}>{line.old_line ?? ""}</td>
      <td className={styles.diffSep} />
      <td className={styles.diffGutter}>
        {threadsOnLine.map((t) => (
          <ThreadMarkerDot key={t._id} severity={t.severity} />
        ))}
        {newLine ?? ""}
      </td>
      <td className={styles.diffSep} />
      <td className={styles.diffCode}>{line.text}</td>
    </tr>
  )
}

function DiffTable({
  hunks,
  threadsByLine,
  onComment,
}: {
  hunks: DiffHunk[]
  threadsByLine: Map<number, ReviewThread[]>
  onComment: (target: CommentTarget) => void
}) {
  return (
    <table className={styles.diffTable} data-testid="diff-table">
      <tbody>
        {hunks.flatMap((hunk, hi) =>
          hunk.lines.map((line, li) => (
            <DiffRow
              key={`${hi}-${li}`}
              line={line}
              threadsOnLine={threadsByLine.get(line.new_line ?? -1) ?? []}
              onComment={onComment}
            />
          )),
        )}
      </tbody>
    </table>
  )
}

function InlineComposer({
  target,
  filePath,
  reviewId,
  orchestrationId,
  onDone,
  onCancel,
}: {
  target: CommentTarget
  filePath: string
  reviewId: string
  orchestrationId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const createThread = useMutation(api.reviewThreads.createThread)

  const handleSubmit = async () => {
    if (!body.trim()) return
    setSubmitting(true)
    try {
      await createThread({
        reviewId: reviewId as Id<"reviews">,
        orchestrationId: orchestrationId as Id<"orchestrations">,
        filePath,
        line: target.line,
        commitSha: "",
        summary: body.split("\n")[0].slice(0, 80),
        body,
        severity: "p2",
        status: "unresolved",
        source: "human",
        author: "human",
        gateImpact: "review",
      })
      onDone()
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.inlineComposer} data-testid="inline-composer">
      <div className={styles.inlineComposerTarget}>
        {filePath}:{target.line}
      </div>
      <textarea
        className={styles.inlineComposerTextarea}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        aria-label="Comment body"
      />
      <div className={styles.inlineComposerActions}>
        <button
          className={styles.inlineComposerSubmit}
          disabled={submitting || !body.trim()}
          onClick={handleSubmit}
        >
          {submitting ? "Saving..." : "Comment"}
        </button>
        <button className={styles.inlineComposerCancel} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function FileCommentsSection({
  threads,
  filePath,
}: {
  threads: ReviewThread[]
  filePath: string
}) {
  const fileThreads = threads.filter((t) => t.filePath === filePath)
  if (fileThreads.length === 0) return null

  return (
    <div className={styles.fileComments} data-testid="file-comments">
      <div className={styles.fileCommentsTitle}>
        Comments ({fileThreads.length})
      </div>
      {fileThreads.map((t) => (
        <div key={t._id} className={styles.threadCard}>
          <div className={styles.threadMeta}>
            {t.author} &middot; line {t.line} &middot; {t.severity}
          </div>
          <div className={styles.threadSummary}>{t.summary}</div>
          <div className={styles.threadBody}>{t.body}</div>
        </div>
      ))}
    </div>
  )
}

export function ChangesTab({
  reviewId,
  orchestrationId,
  worktreePath,
  baseBranch,
  initialFile,
}: ChangesTabProps) {
  const [selectedPath, setSelectedPath] = useState(initialFile ?? "")
  const [fileFilter, setFileFilter] = useState("")
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null)
  const [springProgress, setSpringProgress] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const {
    data: files,
    isLoading: filesLoading,
    isError: filesError,
  } = useDiffFiles(worktreePath, baseBranch)

  const effectivePath = selectedPath || (files && files.length > 0 ? files[0].path : "")

  const {
    data: hunks,
    isLoading: hunksLoading,
  } = useDiffFile(worktreePath, baseBranch, effectivePath)

  const threadsResult = useTypedQuery(ReviewThreadListQuery, { reviewId })
  const threads: ReviewThread[] =
    threadsResult.status === "success" ? (threadsResult.data ?? []) : []

  const threadsByLine = useMemo(() => {
    const map = new Map<number, ReviewThread[]>()
    for (const t of threads) {
      if (t.filePath !== effectivePath) continue
      const existing = map.get(t.line) ?? []
      existing.push(t)
      map.set(t.line, existing)
    }
    return map
  }, [threads, effectivePath])

  const fileIndex = files ? files.findIndex((f) => f.path === effectivePath) : -1

  const jumpAdjacent = useCallback(
    (direction: "next" | "prev") => {
      if (!files || files.length === 0) return
      const idx = direction === "next" ? fileIndex + 1 : fileIndex - 1
      if (idx >= 0 && idx < files.length) {
        setSelectedPath(files[idx].path)
        setCommentTarget(null)
        scrollRef.current?.scrollTo(0, 0)
      }
    },
    [files, fileIndex],
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const el = scrollRef.current
      if (!el || !files || files.length <= 1) return

      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 2
      const atTop = el.scrollTop < 2

      if (atBottom && e.deltaY > 0) {
        setSpringProgress((p) => {
          const next = p + Math.abs(e.deltaY)
          if (next >= SPRING_THRESHOLD) {
            jumpAdjacent("next")
            return 0
          }
          return next
        })
      } else if (atTop && e.deltaY < 0) {
        setSpringProgress((p) => {
          const next = p + Math.abs(e.deltaY)
          if (next >= SPRING_THRESHOLD) {
            jumpAdjacent("prev")
            return 0
          }
          return next
        })
      } else {
        setSpringProgress(0)
      }
    },
    [files, jumpAdjacent],
  )

  if (filesLoading) {
    return <div className={styles.emptyState}>Loading files...</div>
  }
  if (filesError) {
    return <div className={styles.emptyState}>Failed to load diff</div>
  }
  if (!files || files.length === 0) {
    return <div className={styles.emptyState}>No changed files</div>
  }

  const selectedFileStat = files.find((f) => f.path === effectivePath)

  return (
    <div className={styles.changesLayout}>
      <FileSidebar
        files={files}
        selectedPath={effectivePath}
        filter={fileFilter}
        onFilterChange={setFileFilter}
        onSelect={(path) => {
          setSelectedPath(path)
          setCommentTarget(null)
          setSpringProgress(0)
          scrollRef.current?.scrollTo(0, 0)
        }}
      />

      <div className={styles.diffPanel}>
        <div className={styles.diffHeader}>
          <div className={styles.diffFilePath}>{effectivePath}</div>
          {selectedFileStat && (
            <div className={styles.diffStats}>
              +{selectedFileStat.insertions} -{selectedFileStat.deletions}
            </div>
          )}
        </div>

        <div
          className={styles.diffScroll}
          ref={scrollRef}
          onWheel={handleWheel}
        >
          {hunksLoading ? (
            <div className={styles.emptyState}>Loading diff...</div>
          ) : hunks && hunks.length > 0 ? (
            <DiffTable
              hunks={hunks}
              threadsByLine={threadsByLine}
              onComment={setCommentTarget}
            />
          ) : (
            <div className={styles.emptyState}>No diff content</div>
          )}
        </div>

        {commentTarget && (
          <InlineComposer
            target={commentTarget}
            filePath={effectivePath}
            reviewId={reviewId}
            orchestrationId={orchestrationId}
            onDone={() => setCommentTarget(null)}
            onCancel={() => setCommentTarget(null)}
          />
        )}

        <FileCommentsSection threads={threads} filePath={effectivePath} />

        {springProgress > 0 && (
          <div className={styles.springIndicator}>
            <span>
              {fileIndex < (files?.length ?? 0) - 1
                ? "Scroll to next file..."
                : "Scroll to previous file..."}
            </span>
            <div className={styles.springBar}>
              <div
                className={styles.springFill}
                style={{
                  width: `${Math.min(100, (springProgress / SPRING_THRESHOLD) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

4. Create `tina-web/src/components/__tests__/ChangesTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { ChangesTab } from "../ChangesTab"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess } from "@/test/builders/query"
import { buildReviewThread } from "@/test/builders/domain/entities"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useDaemonQuery")
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return { ...mod, useMutation: vi.fn(() => vi.fn()) }
})

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const mockDaemon = vi.mocked(await import("@/hooks/useDaemonQuery"))

function mockDiffFiles(data: unknown[] | undefined, isLoading = false, isError = false) {
  mockDaemon.useDiffFiles.mockReturnValue({
    data: data as any,
    isLoading,
    isError,
    error: isError ? new Error("fail") : null,
  } as any)
}

function mockDiffFile(data: unknown[] | undefined, isLoading = false) {
  mockDaemon.useDiffFile.mockReturnValue({
    data: data as any,
    isLoading,
    isError: false,
    error: null,
  } as any)
}

const SAMPLE_FILES = [
  { path: "src/foo.ts", status: "modified", insertions: 5, deletions: 2, old_path: null },
  { path: "src/bar.ts", status: "added", insertions: 10, deletions: 0, old_path: null },
]

const SAMPLE_HUNKS = [
  {
    old_start: 1,
    old_count: 3,
    new_start: 1,
    new_count: 4,
    lines: [
      { kind: "context", old_line: 1, new_line: 1, text: "import React from 'react'" },
      { kind: "delete", old_line: 2, new_line: null, text: "const old = true" },
      { kind: "add", old_line: null, new_line: 2, text: "const updated = true" },
      { kind: "add", old_line: null, new_line: 3, text: "const extra = false" },
      { kind: "context", old_line: 3, new_line: 4, text: "export default {}" },
    ],
  },
]

function renderTab(props: Partial<React.ComponentProps<typeof ChangesTab>> = {}) {
  return render(
    <MemoryRouter>
      <ChangesTab
        reviewId="rev1"
        orchestrationId="orch1"
        worktreePath="/tmp/wt"
        baseBranch="main"
        {...props}
      />
    </MemoryRouter>,
  )
}

describe("ChangesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([]),
      },
    })
    mockDiffFiles(undefined, true)
    mockDiffFile(undefined, true)
  })

  it("shows loading state when files are loading", () => {
    mockDiffFiles(undefined, true)
    renderTab()
    expect(screen.getByText("Loading files...")).toBeInTheDocument()
  })

  it("shows error state when files fail to load", () => {
    mockDiffFiles(undefined, false, true)
    renderTab()
    expect(screen.getByText("Failed to load diff")).toBeInTheDocument()
  })

  it("shows empty state when no files changed", () => {
    mockDiffFiles([], false)
    renderTab()
    expect(screen.getByText("No changed files")).toBeInTheDocument()
  })

  it("renders file sidebar with file items", () => {
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)
    renderTab()

    expect(screen.getByTestId("file-sidebar")).toBeInTheDocument()
    const items = screen.getAllByTestId("file-item")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("src/foo.ts")
    expect(items[1]).toHaveTextContent("src/bar.ts")
  })

  it("auto-selects first file when no initialFile", () => {
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)
    renderTab()

    // First file is selected (diff header shows its path)
    expect(screen.getByText("src/foo.ts")).toBeInTheDocument()
  })

  it("pre-selects initialFile when provided", () => {
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)
    renderTab({ initialFile: "src/bar.ts" })

    // The diff header should show bar.ts path
    const diffPath = screen.getAllByText("src/bar.ts")
    expect(diffPath.length).toBeGreaterThanOrEqual(1)
  })

  it("filters sidebar list when typing in filter", async () => {
    const user = userEvent.setup()
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)
    renderTab()

    const filterInput = screen.getByLabelText("Filter files")
    await user.type(filterInput, "bar")

    const items = screen.getAllByTestId("file-item")
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent("src/bar.ts")
  })

  it("renders diff table with hunks when file selected", () => {
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)
    renderTab()

    expect(screen.getByTestId("diff-table")).toBeInTheDocument()
    // Check some diff content appears
    expect(screen.getByText("import React from 'react'")).toBeInTheDocument()
    expect(screen.getByText("const updated = true")).toBeInTheDocument()
  })

  it("shows thread markers on lines with matching threads", () => {
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([
          buildReviewThread({
            _id: "t1",
            filePath: "src/foo.ts",
            line: 2,
            severity: "p0",
          }),
        ]),
      },
    })

    renderTab()

    const markers = screen.getAllByTestId("thread-marker")
    expect(markers.length).toBeGreaterThanOrEqual(1)
  })

  it("shows per-file comments section with threads for selected file", () => {
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([
          buildReviewThread({
            _id: "t1",
            filePath: "src/foo.ts",
            line: 42,
            summary: "Fix this issue",
            body: "Detailed explanation",
          }),
        ]),
      },
    })

    renderTab()

    expect(screen.getByTestId("file-comments")).toBeInTheDocument()
    expect(screen.getByText("Fix this issue")).toBeInTheDocument()
    expect(screen.getByText("Detailed explanation")).toBeInTheDocument()
  })

  it("opens inline composer when comment button clicked", async () => {
    const user = userEvent.setup()
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)
    renderTab()

    const commentBtns = screen.getAllByLabelText(/Comment on line/)
    await user.click(commentBtns[0])

    expect(screen.getByTestId("inline-composer")).toBeInTheDocument()
    expect(screen.getByLabelText("Comment body")).toBeInTheDocument()
  })

  it("closes inline composer on cancel", async () => {
    const user = userEvent.setup()
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)
    renderTab()

    const commentBtns = screen.getAllByLabelText(/Comment on line/)
    await user.click(commentBtns[0])
    expect(screen.getByTestId("inline-composer")).toBeInTheDocument()

    await user.click(screen.getByText("Cancel"))
    expect(screen.queryByTestId("inline-composer")).not.toBeInTheDocument()
  })

  it("submits inline comment calling createThread mutation", async () => {
    const mockCreateThread = vi.fn().mockResolvedValue("thread-id")
    const { useMutation } = await import("convex/react")
    vi.mocked(useMutation).mockReturnValue(mockCreateThread)

    const user = userEvent.setup()
    mockDiffFiles(SAMPLE_FILES)
    mockDiffFile(SAMPLE_HUNKS)
    renderTab()

    const commentBtns = screen.getAllByLabelText(/Comment on line/)
    await user.click(commentBtns[0])

    const textarea = screen.getByLabelText("Comment body")
    await user.type(textarea, "This needs fixing")

    await user.click(screen.getByText("Comment"))
    expect(mockCreateThread).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "human",
        author: "human",
        severity: "p2",
      }),
    )
  })
})
```

5. Run tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- ChangesTab 2>&1 | tail -20`
Expected: All tests pass

6. If tests fail, debug and fix until they pass. Then commit:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && git add tina-web/src/components/ChangesTab.tsx tina-web/src/components/ChangesTab.module.scss tina-web/src/components/__tests__/ChangesTab.test.tsx && git commit -m "feat: build ChangesTab component with file sidebar, diff view, thread markers, inline commenting"`
Expected: Commit created successfully

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

   a. Add import for `ChangesTab` and `OrchestrationDetailQuery`:
   ```typescript
   import { ChangesTab } from "./ChangesTab"
   import {
     ReviewDetailQuery,
     ReviewGateListQuery,
     OrchestrationDetailQuery,
   } from "@/services/data/queryDefs"
   ```
   (Note: `ReviewDetailQuery` and `ReviewGateListQuery` are already imported. Just add `OrchestrationDetailQuery` to the existing import.)

   b. Inside `ReviewDetailContent`, after the `gatesResult` query, add:
   ```typescript
   const orchResult = useTypedQuery(OrchestrationDetailQuery, {
     orchestrationId: orchestrationId ?? "",
   })
   ```

   c. Replace the Changes tab placeholder block (currently lines 157-161):

   **Find this:**
   ```tsx
   {activeTab === "changes" && (
     <div className={styles.placeholder}>
       Changes tab — coming in Phase 6
     </div>
   )}
   ```

   **Replace with:**
   ```tsx
   {activeTab === "changes" &&
     orchResult.status === "success" &&
     orchResult.data && (
       <ChangesTab
         reviewId={reviewId ?? ""}
         orchestrationId={orchestrationId ?? ""}
         worktreePath={Option.getOrElse(orchResult.data.worktreePath, () => "")}
         baseBranch={orchResult.data.branch}
       />
     )}
   ```

2. Edit `tina-web/src/components/__tests__/ReviewDetailPage.test.tsx`:

   a. Add mock for ChangesTab alongside existing mocks:
   ```typescript
   vi.mock("../ChangesTab", () => ({
     ChangesTab: () => <div data-testid="changes-tab">ChangesTab</div>,
   }))
   ```

   b. Add imports for `buildOrchestrationDetail` and `some`:
   ```typescript
   import { buildOrchestrationDetail } from "@/test/builders/domain/fixtures"
   import { some } from "@/test/builders/domain/primitives"
   ```
   (Note: `some` may already be imported. Add `buildOrchestrationDetail` to existing fixtures import if one exists, or add a new import.)

   c. Add `"orchestrations.detail"` state to ALL existing tests that use `installAppRuntimeQueryMock`. For each test's `states` object, add:
   ```typescript
   "orchestrations.detail": querySuccess(buildOrchestrationDetail()),
   ```

   d. Update the "shows placeholder when switching to Changes tab" test (approximately line 160-174) to verify the ChangesTab is rendered instead of the placeholder:

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

3. Run ReviewDetailPage tests:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts -- ReviewDetailPage 2>&1 | tail -15`
Expected: All tests pass

4. Run full test suite:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx vitest run --config vitest.config.ts 2>&1 | tail -15`
Expected: Full test suite passes

5. Run type check:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design/tina-web && npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors

6. Commit:

Run: `cd /Users/joshua/Projects/tina/.worktrees/mechanical-review-workbench-design && git add tina-web/src/components/ReviewDetailPage.tsx tina-web/src/components/__tests__/ReviewDetailPage.test.tsx && git commit -m "feat: integrate ChangesTab into ReviewDetailPage replacing placeholder"`
Expected: Commit created successfully

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
