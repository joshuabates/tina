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
  threadsOnLine: readonly ReviewThread[]
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
  threadsByLine: Map<number, readonly ReviewThread[]>
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
  threads: readonly ReviewThread[]
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
  const threads: readonly ReviewThread[] =
    threadsResult.status === "success" ? (threadsResult.data ?? []) : []

  const threadsByLine = useMemo(() => {
    const map = new Map<number, readonly ReviewThread[]>()
    for (const t of threads) {
      if (t.filePath !== effectivePath) continue
      const existing = map.get(t.line) ?? []
      map.set(t.line, [...existing, t])
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
