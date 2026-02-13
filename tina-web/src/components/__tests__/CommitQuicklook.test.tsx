import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { CommitQuicklook, type HydratedCommit } from "../CommitQuicklook"
import { defineQuicklookDialogContract } from "@/test/harness/quicklook-contract"

// Mock useTypedQuery to avoid Convex client requirement
vi.mock("@/hooks/useTypedQuery", () => ({
  useTypedQuery: vi.fn(() => ({ status: "success", data: [] })),
}))

// Mock useMutation to avoid Convex client requirement
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

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
    expect(screen.getByText("Bob <bob@example.com>")).toBeInTheDocument()
    expect(screen.getByText("+25")).toBeInTheDocument()
    expect(screen.getByText("-10")).toBeInTheDocument()
  })

  it("shows placeholders when daemon data is unavailable", () => {
    const commit = createMockCommit({
      detail: undefined,
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    expect(screen.getByText("Commit message unavailable (daemon offline)")).toBeInTheDocument()
    expect(screen.getByText("Unknown")).toBeInTheDocument()
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
        "Author: Alice <alice@example.com>",
        "+15 -5",
      ].join("\n"),
    })
  })

  defineQuicklookDialogContract({
    renderDialog: () => {
      render(<CommitQuicklook commit={createMockCommit()} onClose={mockOnClose} />)
    },
    onClose: mockOnClose,
  })
})
