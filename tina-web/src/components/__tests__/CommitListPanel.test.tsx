import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { CommitListPanel } from "../CommitListPanel"
import type { Commit } from "@/schemas"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useCreateSession")

// Mock useMutation to avoid Convex client requirement
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery
const mockUseCreateSession = vi.mocked(
  await import("@/hooks/useCreateSession"),
).useCreateSession

function createMockCommit(overrides: Partial<Commit> = {}): Commit {
  return {
    _id: "commit1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: "1",
    sha: "abc123def456",
    shortSha: "abc123",
    subject: "feat: add feature X",
    author: "Alice <alice@example.com>",
    timestamp: "2026-02-10T10:00:00Z",
    insertions: 15,
    deletions: 5,
    recordedAt: "2026-02-10T10:00:05Z",
    ...overrides,
  }
}

describe("CommitListPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCreateSession.mockReturnValue({
      createAndConnect: vi.fn(),
      connectToPane: vi.fn(),
    })
  })

  it("shows loading state while commits are loading", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": queryLoading(),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" />)

    expect(screen.getByText("Loading commits...")).toBeInTheDocument()
  })

  it("shows error state when commits fail to load", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": queryError("Network error"),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" />)

    expect(screen.getByText("Failed to load commits")).toBeInTheDocument()
  })

  it("shows empty state when no commits exist", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": querySuccess([]),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" />)

    expect(screen.getByText("No commits yet")).toBeInTheDocument()
  })

  it("groups commits by phase when phaseNumber not provided", () => {
    const commits = [
      createMockCommit({
        _id: "commit1",
        phaseNumber: "1",
        shortSha: "abc123",
        subject: "feat: phase 1 feature",
      }),
      createMockCommit({
        _id: "commit2",
        phaseNumber: "2",
        shortSha: "def456",
        subject: "feat: phase 2 feature",
      }),
      createMockCommit({
        _id: "commit3",
        phaseNumber: "2",
        shortSha: "ghi789",
        subject: "fix: phase 2 bugfix",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": querySuccess(commits),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" />)

    // Verify phase headings appear
    expect(screen.getByText("Phase 1")).toBeInTheDocument()
    expect(screen.getByText("Phase 2")).toBeInTheDocument()

    // Verify commits are displayed
    expect(screen.getByText("feat: phase 1 feature")).toBeInTheDocument()
    expect(screen.getByText("feat: phase 2 feature")).toBeInTheDocument()
    expect(screen.getByText("fix: phase 2 bugfix")).toBeInTheDocument()
  })

  it("shows only single phase commits when phaseNumber provided", () => {
    const commits = [
      createMockCommit({
        _id: "commit1",
        phaseNumber: "1",
        shortSha: "abc123",
        subject: "feat: phase 1 feature",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": querySuccess(commits),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" phaseNumber="1" />)

    // Verify no phase headings (single phase view)
    expect(screen.queryByText("Phase 1")).not.toBeInTheDocument()

    // Verify commit is displayed
    expect(screen.getByText("feat: phase 1 feature")).toBeInTheDocument()
  })

  it("displays commit metadata correctly", () => {
    const commit = createMockCommit({
      shortSha: "abc123",
      subject: "feat: add awesome feature",
      author: "Bob <bob@example.com>",
      insertions: 25,
      deletions: 10,
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": querySuccess([commit]),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" phaseNumber="1" />)

    // Verify short SHA displayed
    expect(screen.getByText("abc123")).toBeInTheDocument()

    // Verify subject displayed
    expect(screen.getByText("feat: add awesome feature")).toBeInTheDocument()

    // Verify author displayed
    expect(screen.getByText(/Bob <bob@example.com>/)).toBeInTheDocument()

    // Verify insertions/deletions displayed
    expect(screen.getByText("+25")).toBeInTheDocument()
    expect(screen.getByText("-10")).toBeInTheDocument()
  })

  it("opens CommitQuicklook when commit clicked", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit({
      shortSha: "abc123",
      subject: "feat: clickable commit",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": querySuccess([commit]),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" phaseNumber="1" />)

    // Click the commit button
    const commitButton = screen.getByText("feat: clickable commit").closest("button")!
    await user.click(commitButton)

    // Verify CommitQuicklook modal is rendered
    expect(screen.getByText("Commit Details")).toBeInTheDocument()
  })
})
