import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Search } from "lucide-react"
import {
  useDiffFile,
  useDiffFiles,
  type DiffHunk,
  type DiffLine,
} from "@/hooks/useDaemonQuery"
import diffStyles from "./ChangesTab.module.scss"
import styles from "./CommitDiffPreview.module.scss"

const STATUS_MARKERS: Record<string, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
}

interface SplitDiffRow {
  id: string
  oldLine: number | null
  oldText: string
  newLine: number | null
  newText: string
  kind: "context" | "add" | "delete" | "modify"
}

function hunkToSplitRows(hunks: DiffHunk[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = []

  hunks.forEach((hunk, hunkIndex) => {
    let lineIndex = 0

    while (lineIndex < hunk.lines.length) {
      const line = hunk.lines[lineIndex]
      if (!line) break

      const nextLine = hunk.lines[lineIndex + 1]

      if (line.kind === "context") {
        rows.push({
          id: `${hunkIndex}-${lineIndex}`,
          oldLine: line.old_line,
          oldText: line.text,
          newLine: line.new_line,
          newText: line.text,
          kind: "context",
        })
        lineIndex += 1
        continue
      }

      if (line.kind === "delete" && nextLine?.kind === "add") {
        rows.push({
          id: `${hunkIndex}-${lineIndex}`,
          oldLine: line.old_line,
          oldText: line.text,
          newLine: nextLine.new_line,
          newText: nextLine.text,
          kind: "modify",
        })
        lineIndex += 2
        continue
      }

      if (line.kind === "add" && nextLine?.kind === "delete") {
        rows.push({
          id: `${hunkIndex}-${lineIndex}`,
          oldLine: nextLine.old_line,
          oldText: nextLine.text,
          newLine: line.new_line,
          newText: line.text,
          kind: "modify",
        })
        lineIndex += 2
        continue
      }

      if (line.kind === "delete") {
        rows.push({
          id: `${hunkIndex}-${lineIndex}`,
          oldLine: line.old_line,
          oldText: line.text,
          newLine: null,
          newText: "",
          kind: "delete",
        })
        lineIndex += 1
        continue
      }

      rows.push({
        id: `${hunkIndex}-${lineIndex}`,
        oldLine: null,
        oldText: "",
        newLine: line.new_line,
        newText: line.text,
        kind: "add",
      })
      lineIndex += 1
    }
  })

  return rows
}

function DiffTable({ hunks }: { hunks: DiffHunk[] }) {
  const rows = useMemo(() => hunkToSplitRows(hunks), [hunks])

  return (
    <table className={styles.splitTable} data-testid="commit-diff-table">
      <tbody>
        {rows.map((row) => {
          const oldChanged = row.kind === "delete" || row.kind === "modify"
          const newChanged = row.kind === "add" || row.kind === "modify"

          return (
            <tr key={row.id}>
              <td className={`${diffStyles.diffGutter} ${styles.gutter}`}>{row.oldLine ?? ""}</td>
              <td
                className={`${diffStyles.diffCode} ${styles.codeCell} ${styles.oldCode} ${oldChanged ? styles.oldChanged : ""}`}
              >
                {row.oldText}
              </td>
              <td className={styles.middleDivider} />
              <td className={`${diffStyles.diffGutter} ${styles.gutter}`}>{row.newLine ?? ""}</td>
              <td
                className={`${diffStyles.diffCode} ${styles.codeCell} ${styles.newCode} ${newChanged ? styles.newChanged : ""}`}
              >
                {row.newText}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

interface CommitDiffPreviewProps {
  worktreePath: string
  baseBranch: string
}

export function CommitDiffPreview({ worktreePath, baseBranch }: CommitDiffPreviewProps) {
  const [selectedPath, setSelectedPath] = useState("")
  const [fileFilter, setFileFilter] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const {
    data: files,
    isLoading: filesLoading,
    isError: filesError,
  } = useDiffFiles(worktreePath, baseBranch)

  const filteredFiles = useMemo(
    () =>
      fileFilter
        ? (files ?? []).filter((file) =>
            file.path.toLowerCase().includes(fileFilter.toLowerCase()),
          )
        : (files ?? []),
    [files, fileFilter],
  )

  const effectivePath = selectedPath || (files && files.length > 0 ? files[0].path : "")

  const {
    data: hunks,
    isLoading: hunksLoading,
    isError: hunksError,
  } = useDiffFile(worktreePath, baseBranch, effectivePath)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!pickerRef.current) return
      if (pickerRef.current.contains(event.target as Node)) return
      setPickerOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  if (!worktreePath) {
    return <div className={styles.emptyState}>Worktree path unavailable</div>
  }
  if (filesLoading) {
    return <div className={styles.emptyState}>Loading commit diff...</div>
  }
  if (filesError) {
    return <div className={styles.emptyState}>Failed to load commit diff</div>
  }
  if (!files || files.length === 0) {
    return <div className={styles.emptyState}>No diff content for this commit</div>
  }

  const selectedFile = files.find((file) => file.path === effectivePath) ?? files[0]

  return (
    <div className={styles.container}>
      <div ref={pickerRef} className={styles.finder}>
        <button
          type="button"
          className={styles.finderTrigger}
          onClick={() => setPickerOpen((open) => !open)}
          aria-expanded={pickerOpen}
          aria-label="Choose changed file"
        >
          <span className={styles.finderLabel}>File</span>
          <span className={styles.finderPath}>{selectedFile.path}</span>
          <span className={styles.finderStats}>
            +{selectedFile.insertions} -{selectedFile.deletions}
          </span>
          <ChevronDown className={`${styles.finderChevron} ${pickerOpen ? styles.open : ""}`} />
        </button>

        {pickerOpen && (
          <div className={styles.finderMenu}>
            <div className={styles.searchRow}>
              <Search className={styles.searchIcon} />
              <input
                value={fileFilter}
                onChange={(event) => setFileFilter(event.target.value)}
                placeholder="Filter files..."
                aria-label="Filter diff files"
                className={styles.searchInput}
                autoFocus
              />
            </div>
            <div className={styles.optionList}>
              {filteredFiles.map((file) => {
                const isSelected = file.path === selectedFile.path
                return (
                  <button
                    key={file.path}
                    type="button"
                    className={`${styles.option} ${isSelected ? styles.selected : ""}`}
                    onClick={() => {
                      setSelectedPath(file.path)
                      setPickerOpen(false)
                    }}
                  >
                    <span className={styles.optionMarker}>
                      {STATUS_MARKERS[file.status] ?? "?"}
                    </span>
                    <span className={styles.optionPath}>{file.path}</span>
                    <span className={styles.optionStats}>
                      +{file.insertions} -{file.deletions}
                    </span>
                    {isSelected && <Check className={styles.check} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className={styles.diffPanel}>
        {hunksLoading ? (
          <div className={styles.emptyState}>Loading file diff...</div>
        ) : hunksError ? (
          <div className={styles.emptyState}>Failed to load file diff</div>
        ) : hunks && hunks.length > 0 ? (
          <div className={styles.diffScroll}>
            <DiffTable hunks={hunks} />
          </div>
        ) : (
          <div className={styles.emptyState}>No diff content</div>
        )}
      </div>
    </div>
  )
}
