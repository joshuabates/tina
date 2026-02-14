import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { CommitQuicklook } from "../CommitQuicklook"
import type { Commit } from "@/schemas"
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

function createMockCommit(overrides: Partial<Commit> = {}): Commit {
  return {
    _id: "commit1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: "1",
    sha: "abc123def456789",
    shortSha: "abc123",
    subject: "feat: add awesome feature",
    author: "Alice <alice@example.com>",
    timestamp: "2026-02-10T10:00:00Z",
    insertions: 15,
    deletions: 5,
    recordedAt: "2026-02-10T10:00:05Z",
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

  it("displays full commit details", () => {
    const commit = createMockCommit({
      sha: "abc123def456789",
      subject: "feat: add amazing feature",
      author: "Bob <bob@example.com>",
      timestamp: "2026-02-10T15:30:00Z",
      insertions: 25,
      deletions: 10,
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    // Verify title
    expect(screen.getByText("Commit Details")).toBeInTheDocument()

    // Verify full SHA displayed
    expect(screen.getByText("abc123def456789")).toBeInTheDocument()

    // Verify subject displayed
    expect(screen.getByText("feat: add amazing feature")).toBeInTheDocument()

    // Verify author displayed
    expect(screen.getByText("Bob <bob@example.com>")).toBeInTheDocument()

    // Verify insertions displayed in green
    expect(screen.getByText("+25")).toBeInTheDocument()

    // Verify deletions displayed in red
    expect(screen.getByText("-10")).toBeInTheDocument()
  })

  it("formats timestamp correctly", () => {
    const commit = createMockCommit({
      timestamp: "2026-02-10T10:00:00Z",
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    // The component uses toLocaleString(), so we just verify some part appears
    // (exact format is locale-dependent)
    const timestampElements = screen.getAllByText(/2026|10|Feb/i)
    expect(timestampElements.length).toBeGreaterThan(0)
  })

  it("copies full SHA to clipboard on copy button click", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit({
      sha: "abc123def456789full",
    })

    // Mock clipboard API
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    })

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    // Click the copy button
    const copyButton = screen.getByText("Copy")
    await user.click(copyButton)

    // Verify clipboard.writeText was called with full SHA
    expect(writeTextMock).toHaveBeenCalledWith("abc123def456789full")
  })

  it("calls onClose when close button clicked", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit()

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    // Click the close button
    const closeButton = screen.getByLabelText("Close quicklook")
    await user.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("calls onClose when backdrop clicked", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit()

    render(<CommitQuicklook commit={commit} onClose={mockOnClose} />)

    // Click the backdrop
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
      subject: "feat: add awesome feature",
      author: "Alice <alice@example.com>",
      insertions: 15,
      deletions: 5,
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
