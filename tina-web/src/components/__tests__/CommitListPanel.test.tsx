import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { CommitListPanel } from "../CommitListPanel"
import type { Commit } from "@/schemas"
import type { DaemonCommitDetail } from "@/hooks/useDaemonQuery"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useCreateSession")
vi.mock("@/hooks/useDaemonQuery")

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

const mockUseCommitDetails = vi.mocked(
  await import("@/hooks/useDaemonQuery"),
).useCommitDetails

function createMockCommit(overrides: Partial<Commit> = {}): Commit {
  return {
    _id: "commit1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: "1",
    sha: "abc123def456",
    shortSha: "abc123",
    recordedAt: "2026-02-10T10:00:05Z",
    ...overrides,
  }
}

function createDetail(sha: string, overrides: Partial<DaemonCommitDetail> = {}): DaemonCommitDetail {
  return {
    sha,
    short_sha: sha.slice(0, 7),
    subject: "feat: add feature X",
    author: "Alice <alice@example.com>",
    timestamp: "2026-02-10T10:00:00Z",
    insertions: 15,
    deletions: 5,
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
    mockUseCommitDetails.mockReturnValue({
      data: { commits: [], missingShas: [] },
      isError: false,
    } as unknown as ReturnType<typeof mockUseCommitDetails>)
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

  it("groups commits by phase and renders daemon-enriched metadata", () => {
    const commits = [
      createMockCommit({
        _id: "commit1",
        phaseNumber: "1",
        shortSha: "abc123",
        sha: "abc123def456",
      }),
      createMockCommit({
        _id: "commit2",
        phaseNumber: "2",
        shortSha: "def456",
        sha: "def456abc123",
      }),
      createMockCommit({
        _id: "commit3",
        phaseNumber: "2",
        shortSha: "ghi789",
        sha: "ghi789zzz111",
      }),
    ]

    mockUseCommitDetails.mockReturnValue({
      data: {
        commits: [
          createDetail("abc123def456", { subject: "feat: phase 1 feature" }),
          createDetail("def456abc123", { subject: "feat: phase 2 feature" }),
          createDetail("ghi789zzz111", { subject: "fix: phase 2 bugfix" }),
        ],
        missingShas: [],
      },
      isError: false,
    } as unknown as ReturnType<typeof mockUseCommitDetails>)

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": querySuccess(commits),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" />)

    expect(screen.getByText("Phase 1")).toBeInTheDocument()
    expect(screen.getByText("Phase 2")).toBeInTheDocument()
    expect(screen.getByText("feat: phase 1 feature")).toBeInTheDocument()
    expect(screen.getByText("feat: phase 2 feature")).toBeInTheDocument()
    expect(screen.getByText("fix: phase 2 bugfix")).toBeInTheDocument()
  })

  it("shows index-only fallback when daemon details fail", () => {
    const commits = [
      createMockCommit({
        _id: "commit1",
        phaseNumber: "1",
        shortSha: "abc123",
        sha: "abc123def456",
      }),
    ]

    mockUseCommitDetails.mockReturnValue({
      data: { commits: [], missingShas: ["abc123def456"] },
      isError: true,
    } as unknown as ReturnType<typeof mockUseCommitDetails>)

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": querySuccess(commits),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" phaseNumber="1" />)

    expect(screen.getByText("Daemon details unavailable. Showing commit index only.")).toBeInTheDocument()
    expect(screen.getByText("Commit message unavailable (index only)")).toBeInTheDocument()
    expect(screen.getByText(/metadata unavailable/i)).toBeInTheDocument()
  })

  it("opens CommitQuicklook when commit clicked", async () => {
    const user = userEvent.setup()
    const commit = createMockCommit({
      shortSha: "abc123",
      sha: "abc123def456",
    })

    mockUseCommitDetails.mockReturnValue({
      data: {
        commits: [createDetail("abc123def456", { subject: "feat: clickable commit" })],
        missingShas: [],
      },
      isError: false,
    } as unknown as ReturnType<typeof mockUseCommitDetails>)

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "commits.list": querySuccess([commit]),
      },
    })

    render(<CommitListPanel orchestrationId="orch1" phaseNumber="1" />)

    const commitButton = screen.getByText("feat: clickable commit").closest("button")!
    await user.click(commitButton)

    expect(screen.getByText("Commit Details")).toBeInTheDocument()
  })
})
