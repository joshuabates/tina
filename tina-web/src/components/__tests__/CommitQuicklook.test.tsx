import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { CommitQuicklook, type HydratedCommit } from "../CommitQuicklook"
import { defineQuicklookDialogContract } from "@/test/harness/quicklook-contract"

// Mock useTypedQuery to avoid Convex client requirement
vi.mock("@/hooks/useTypedQuery", () => ({
  useTypedQuery: vi.fn(() => ({ status: "success", data: [] })),
}))
vi.mock("@/hooks/useDaemonQuery", () => ({
  useDiffFiles: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  useDiffFile: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}))

// Mock useMutation to avoid Convex client requirement
const mockCreateThread = vi.fn()
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => mockCreateThread),
  }
})

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery
const mockDaemon = vi.mocked(await import("@/hooks/useDaemonQuery"))

const mockCreateAndConnect = vi.fn()
vi.mock("@/hooks/useCreateSession", () => ({
  useCreateSession: () => ({
    createAndConnect: mockCreateAndConnect,
    connectToPane: vi.fn(),
  }),
}))

function createMockCommit(overrides: Partial<HydratedCommit> = {}): HydratedCommit {
  return {
    _id: "commit1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: "1",
    sha: "abc123def456789",
    shortSha: "abc123",
    subject: "feat: add awesome feature",
    recordedAt: "2026-02-10T10:00:05Z",
    detail: {
      sha: "abc123def456789",
      short_sha: "abc123",
      subject: "feat: add awesome feature",
      author: "Alice <alice@example.com>",
      timestamp: "2026-02-10T10:00:00Z",
      insertions: 15,
      deletions: 5,
    },
    ...overrides,
  }
}

describe("CommitQuicklook", () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "reviews.list") {
        return {
          status: "success",
          data: [
            {
              _id: "rev1",
              state: "open",
            },
          ],
        } as any
      }

      if (def.key === "reviewThreads.byOrchestration") {
        return { status: "success", data: [] }
      }

      if (def.key === "orchestrations.detail") {
        return {
          status: "success",
          data: {
            worktreePath: Option.some("/tmp/tina-worktree"),
          },
        } as any
      }

      return { status: "success", data: [] }
    })
    mockDaemon.useDiffFiles.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as any)
    mockDaemon.useDiffFile.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as any)
  })

  afterEach(() => {
    cleanup()
  })

  it("displays full commit details when daemon data is present", () => {
    const commit = createMockCommit({
      sha: "abc123def456789",
      detail: {
        sha: "abc123def456789",
        short_sha: "abc123",
        subject: "feat: add amazing feature",
        author: "Bob <bob@example.com>",
        timestamp: "2026-02-10T15:30:00Z",
        insertions: 25,
        deletions: 10,
      },
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    expect(screen.getByText("Commit Details")).toBeInTheDocument()
    expect(screen.getByText("abc123def456789")).toBeInTheDocument()
    expect(screen.getByText("feat: add amazing feature")).toBeInTheDocument()
    expect(screen.getByText("+25")).toBeInTheDocument()
    expect(screen.getByText("-10")).toBeInTheDocument()
  })

  it("shows placeholders when daemon data is unavailable", () => {
    const commit = createMockCommit({
      subject: undefined,
      detail: undefined,
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    expect(screen.getByText("Commit message unavailable (daemon offline)")).toBeInTheDocument()
    expect(screen.getByText("Unavailable")).toBeInTheDocument()
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(2)
  })

  it("formats timestamp correctly", () => {
    const commit = createMockCommit({
      detail: {
        sha: "abc123def456789",
        short_sha: "abc123",
        subject: "feat: add awesome feature",
        author: "Alice <alice@example.com>",
        timestamp: "2026-02-10T10:00:00Z",
        insertions: 15,
        deletions: 5,
      },
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    const timestampElements = screen.getAllByText(/2026|10|Feb/i)
    expect(timestampElements.length).toBeGreaterThan(0)
  })

  it("copies full SHA to clipboard on copy button click", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit({
      sha: "abc123def456789full",
      detail: {
        sha: "abc123def456789full",
        short_sha: "abc123d",
        subject: "feat: copy",
        author: "Alice <alice@example.com>",
        timestamp: "2026-02-10T10:00:00Z",
        insertions: 1,
        deletions: 0,
      },
    })

    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    const copyButton = screen.getByText("Copy")
    await user.click(copyButton)

    expect(writeTextMock).toHaveBeenCalledWith("abc123def456789full")
  })

  it("calls onClose when close button clicked", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit()

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    const closeButton = screen.getByLabelText("Close quicklook")
    await user.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("calls onClose when backdrop clicked", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit()

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    const dialog = screen.getByRole("dialog")
    const backdrop = dialog.parentElement!
    await user.click(backdrop)

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("displays a Review this commit button", () => {
    const commit = createMockCommit()

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    expect(screen.getByRole("button", { name: /review this commit/i })).toBeInTheDocument()
  })

  it("calls createAndConnect with commit context when Review button is clicked", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit({
      sha: "abc123def456789",
      detail: {
        sha: "abc123def456789",
        short_sha: "abc123",
        subject: "feat: add awesome feature",
        author: "Alice <alice@example.com>",
        timestamp: "2026-02-10T10:00:00Z",
        insertions: 15,
        deletions: 5,
      },
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    const reviewButton = screen.getByRole("button", { name: /review this commit/i })
    await user.click(reviewButton)

    expect(mockCreateAndConnect).toHaveBeenCalledWith({
      label: "Review: feat: add awesome feature",
      contextType: "commit",
      contextId: "commit1",
      contextSummary: [
        "Commit: abc123def456789",
        "Message: feat: add awesome feature",
        "+15 -5",
      ].join("\n"),
    })
  })

  it("submits commit feedback through review threads", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit({
      sha: "abc123def456789",
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    await user.type(screen.getByLabelText("Comment summary"), "Needs test coverage")
    await user.type(screen.getByLabelText("Comment body"), "Please add cases for edge inputs.")
    await user.click(screen.getByRole("button", { name: "Add feedback" }))

    expect(mockCreateThread).toHaveBeenCalledWith({
      reviewId: "rev1",
      orchestrationId: "orch1",
      summary: "Needs test coverage",
      body: "Please add cases for edge inputs.",
      source: "human",
      filePath: "",
      line: 0,
      commitSha: "abc123def456789",
      severity: "p2",
      author: "human",
      gateImpact: "review",
    })
  })

  it("shows feedback threads only for the selected commit", () => {
    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "reviews.list") {
        return {
          status: "success",
          data: [
            {
              _id: "rev1",
              state: "open",
            },
          ],
        } as any
      }

      if (def.key === "reviewThreads.byOrchestration") {
        return {
          status: "success",
          data: [
            {
              _id: "thread1",
              _creationTime: 123,
              reviewId: "rev1",
              orchestrationId: "orch1",
              filePath: "",
              line: 0,
              commitSha: "abc123def456789",
              summary: "Fix null handling",
              body: "Guard undefined before access.",
              severity: "p2",
              status: "unresolved",
              source: "human",
              author: "dev",
              gateImpact: "review",
              createdAt: "2024-01-01T00:00:00Z",
            },
            {
              _id: "thread2",
              _creationTime: 124,
              reviewId: "rev1",
              orchestrationId: "orch1",
              filePath: "",
              line: 0,
              commitSha: "different-sha",
              summary: "Other commit issue",
              body: "Should not show in this modal.",
              severity: "p2",
              status: "unresolved",
              source: "human",
              author: "dev",
              gateImpact: "review",
              createdAt: "2024-01-01T00:00:00Z",
            },
          ],
        } as any
      }

      if (def.key === "orchestrations.detail") {
        return {
          status: "success",
          data: {
            worktreePath: Option.some("/tmp/tina-worktree"),
          },
        } as any
      }

      return { status: "success", data: [] }
    })

    render(
      <CommitQuicklook
        commit={createMockCommit({ sha: "abc123def456789" })}
        onClose={mockOnClose}
      />,
    )

    expect(screen.getByText("Fix null handling")).toBeInTheDocument()
    expect(screen.queryByText("Other commit issue")).not.toBeInTheDocument()
  })

  it("renders a commit diff preview when daemon diff data is available", () => {
    mockDaemon.useDiffFiles.mockReturnValue({
      data: [
        {
          path: "src/feature.ts",
          status: "modified",
          insertions: 3,
          deletions: 1,
          old_path: null,
        },
      ],
      isLoading: false,
      isError: false,
    } as any)
    mockDaemon.useDiffFile.mockReturnValue({
      data: [
        {
          old_start: 10,
          old_count: 1,
          new_start: 10,
          new_count: 1,
          lines: [
            { kind: "context", old_line: 10, new_line: 10, text: "const a = 1" },
            { kind: "add", old_line: null, new_line: 11, text: "const b = 2" },
          ],
        },
      ],
      isLoading: false,
      isError: false,
    } as any)

    render(<CommitQuicklook commit={createMockCommit()} onClose={mockOnClose} />)

    expect(screen.getByText("Diff")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /choose changed file/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("Filter files...")).not.toBeInTheDocument()
    expect(screen.getAllByText("src/feature.ts").length).toBeGreaterThan(0)
    expect(screen.getAllByText("const a = 1")).toHaveLength(2)
    expect(screen.getByText("const b = 2")).toBeInTheDocument()
  })

  it("uses diff totals for insertions and deletions when commit metadata reports zero", () => {
    mockDaemon.useDiffFiles.mockReturnValue({
      data: [
        {
          path: "src/feature.ts",
          status: "modified",
          insertions: 12,
          deletions: 4,
          old_path: null,
        },
      ],
      isLoading: false,
      isError: false,
    } as any)

    render(
      <CommitQuicklook
        commit={createMockCommit({
          detail: {
            sha: "abc123def456789",
            short_sha: "abc123",
            subject: "feat: add awesome feature",
            author: "Alice <alice@example.com>",
            timestamp: "2026-02-10T10:00:00Z",
            insertions: 0,
            deletions: 0,
          },
        })}
        onClose={mockOnClose}
      />,
    )

    expect(screen.getByText("+12")).toBeInTheDocument()
    expect(screen.getByText("-4")).toBeInTheDocument()
  })

  defineQuicklookDialogContract({
    renderDialog: () => {
      render(<CommitQuicklook commit={createMockCommit()} onClose={mockOnClose} />)
    },
    onClose: mockOnClose,
  })
})
