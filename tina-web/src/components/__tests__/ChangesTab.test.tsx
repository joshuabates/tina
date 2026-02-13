import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
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
  return {
    ...mod,
    useMutation: vi.fn(() => {
      const fn = vi.fn() as any
      fn.withOptimisticUpdate = vi.fn(() => fn)
      return fn
    }),
  }
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

    // First file appears in both sidebar and diff header
    const matches = screen.getAllByText("src/foo.ts")
    expect(matches.length).toBeGreaterThanOrEqual(2)
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
    const mockCreateThread = vi.fn().mockResolvedValue("thread-id") as any
    mockCreateThread.withOptimisticUpdate = vi.fn(() => mockCreateThread)
    const { useMutation } = await import("convex/react")
    vi.mocked(useMutation).mockReturnValue(mockCreateThread as any)

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
