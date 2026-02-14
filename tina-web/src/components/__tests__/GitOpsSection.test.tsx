import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { GitOpsSection } from "../GitOpsSection"
import { buildOrchestrationEvent, none, some } from "@/test/builders/domain"
import type { Commit, OrchestrationEvent } from "@/schemas"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess } from "@/test/builders/query"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useDaemonQuery")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useActionRegistration")
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
const mockUseCommitDetails = vi.mocked(
  await import("@/hooks/useDaemonQuery"),
).useCommitDetails
const mockUseDiffFiles = vi.mocked(
  await import("@/hooks/useDaemonQuery"),
).useDiffFiles
const mockUseDiffFile = vi.mocked(
  await import("@/hooks/useDaemonQuery"),
).useDiffFile
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable
const mockUseActionRegistration = vi.mocked(
  await import("@/hooks/useActionRegistration"),
).useActionRegistration
const mockUseCreateSession = vi.mocked(
  await import("@/hooks/useCreateSession"),
).useCreateSession

function event(overrides: Partial<OrchestrationEvent> = {}): OrchestrationEvent {
  return buildOrchestrationEvent({
    _id: "event1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: some("1"),
    source: "tina-session",
    eventType: "git_commit",
    summary: "Add user authentication",
    detail: some("abc1234"),
    recordedAt: "2024-01-01T10:00:00Z",
    ...overrides,
  })
}

function commitForEvent(gitEvent: OrchestrationEvent): Commit {
  return {
    _id: gitEvent._id,
    _creationTime: gitEvent._creationTime,
    orchestrationId: gitEvent.orchestrationId,
    phaseNumber: "1",
    sha: "abc123def456789",
    shortSha: "abc1234",
    subject: gitEvent.summary,
    recordedAt: gitEvent.recordedAt,
  }
}

function renderSection(gitEvents: OrchestrationEvent[] = [], isLoading = false) {
  installAppRuntimeQueryMock(mockUseTypedQuery, {
    states: {
      "commits.list": querySuccess(gitEvents.map(commitForEvent)),
      "reviews.list": querySuccess([]),
      "reviewThreads.byOrchestration": querySuccess([]),
    },
    detailFallback: querySuccess(null),
  })

  return render(
    <GitOpsSection
      orchestrationId="orch1"
      gitEvents={gitEvents}
      isLoading={isLoading}
    />,
  )
}

describe("GitOpsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseFocusable.mockReturnValue({ isSectionFocused: false, activeIndex: -1 })
    mockUseActionRegistration.mockImplementation(() => {})
    mockUseCommitDetails.mockReturnValue({
      data: { commits: [], missingShas: [] },
      isError: false,
    } as unknown as ReturnType<typeof mockUseCommitDetails>)
    mockUseDiffFiles.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof mockUseDiffFiles>)
    mockUseDiffFile.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof mockUseDiffFile>)
    mockUseCreateSession.mockReturnValue({
      createAndConnect: vi.fn(),
      connectToPane: vi.fn(),
    })
  })

  it("renders recent git events", () => {
    renderSection([
      event({ _id: "event1", summary: "Add user authentication", detail: some("abc1234") }),
      event({ _id: "event2", _creationTime: 1234567891, summary: "Fix login bug", detail: some("def5678") }),
    ])

    expect(screen.getByText("Add user authentication")).toBeInTheDocument()
    expect(screen.getByText("Fix login bug")).toBeInTheDocument()
    expect(screen.getByText("abc1234")).toBeInTheDocument()
    expect(screen.getByText("def5678")).toBeInTheDocument()
  })

  it("renders diff summary from git_diff events", () => {
    renderSection([
      event({ eventType: "git_diff", summary: "Changes in 3 files", detail: some("+42 -15") }),
    ])

    expect(screen.getByText("Changes in 3 files")).toBeInTheDocument()
    expect(screen.getByText("+42 -15")).toBeInTheDocument()
  })

  it("opens commit quicklook when commit item is clicked", async () => {
    const user = userEvent.setup()
    renderSection([
      event({ _id: "event42", summary: "Refactor auth middleware" }),
    ])

    await user.click(
      screen.getByRole("button", { name: /refactor auth middleware/i }),
    )

    expect(screen.getByText("Commit Details")).toBeInTheDocument()
  })

  it("registers list-browsing quicklook actions", () => {
    renderSection([
      event({ _id: "event42", summary: "Refactor auth middleware" }),
    ])

    expect(mockUseActionRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "right-panel-git-quicklook",
        key: " ",
        when: "rightPanel.git",
      }),
    )
    expect(mockUseActionRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "right-panel-git-quicklook-enter",
        key: "Enter",
        when: "rightPanel.git",
      }),
    )
  })

  it("shows empty state when there are no events", () => {
    renderSection([])

    expect(screen.getByText(/no git activity/i)).toBeInTheDocument()
  })

  it("renders detail in monospace font", () => {
    renderSection([event({ eventType: "git_commit", summary: "Add feature", detail: some("abc1234") })])

    expect(screen.getByText("abc1234").className).toMatch(/font-mono/)
  })

  it("handles git events with missing detail", () => {
    renderSection([event({ eventType: "git_commit", summary: "Add feature", detail: none<string>() })])

    expect(screen.getByText("Add feature")).toBeInTheDocument()
    expect(screen.queryByText("abc1234")).not.toBeInTheDocument()
  })

  it("uses stat panel layout with 'Git Operations' label", () => {
    renderSection([])

    expect(screen.getByText("Git Operations")).toBeInTheDocument()
  })

  it("renders loading state while events are fetching", () => {
    renderSection([], true)

    expect(screen.getByText(/loading git activity/i)).toBeInTheDocument()
  })
})
