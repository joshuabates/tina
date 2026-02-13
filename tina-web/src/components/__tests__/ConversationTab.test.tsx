import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { ConversationTab } from "../ConversationTab"
import { buildReviewThread } from "@/test/builders/domain/entities"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading } from "@/test/builders/query"

vi.mock("@/hooks/useTypedQuery")

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

describe("ConversationTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state while threads are loading", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": queryLoading(),
      },
    })

    render(<ConversationTab reviewId="rev1" orchestrationId="orch1" />)

    expect(screen.getByText("Loading comments...")).toBeInTheDocument()
  })

  it("shows empty state when no threads exist", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([]),
      },
    })

    render(<ConversationTab reviewId="rev1" orchestrationId="orch1" />)

    expect(screen.getByText("No comments yet")).toBeInTheDocument()
  })

  it("renders thread cards with summary, body, severity badge, author, timestamp, and file:line reference", () => {
    const thread = buildReviewThread({
      summary: "Missing error handling",
      body: "The function should handle network errors",
      severity: "p1",
      author: "review-agent",
      filePath: "src/auth.ts",
      line: 42,
      createdAt: "2024-01-01T10:00:00Z",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([thread]),
      },
    })

    render(<ConversationTab reviewId="rev1" orchestrationId="orch1" />)

    expect(screen.getByText("Missing error handling")).toBeInTheDocument()
    expect(screen.getByText("The function should handle network errors")).toBeInTheDocument()
    expect(screen.getByText("p1")).toBeInTheDocument()
    expect(screen.getByText("review-agent")).toBeInTheDocument()
    expect(screen.getByText("src/auth.ts:42")).toBeInTheDocument()
    // Timestamp rendered via toLocaleString
    expect(screen.getByText(new Date("2024-01-01T10:00:00Z").toLocaleString())).toBeInTheDocument()
  })

  it("renders general comments without file:line when filePath is empty", () => {
    const thread = buildReviewThread({
      summary: "General observation",
      body: "Overall looks good",
      filePath: "",
      line: 0,
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([thread]),
      },
    })

    render(<ConversationTab reviewId="rev1" orchestrationId="orch1" />)

    expect(screen.getByText("General observation")).toBeInTheDocument()
    // No file:line reference should be rendered for empty filePath
    expect(screen.queryByText(/^\S+:\d+$/)).not.toBeInTheDocument()
  })

  it("renders comment composer with summary input, body textarea, and submit button", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([]),
      },
    })

    render(<ConversationTab reviewId="rev1" orchestrationId="orch1" />)

    expect(screen.getByLabelText("Comment summary")).toBeInTheDocument()
    expect(screen.getByLabelText("Comment body")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Comment" })).toBeInTheDocument()
  })

  it("calls createThread mutation with correct args on submit", async () => {
    const user = userEvent.setup()

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([]),
      },
    })

    render(<ConversationTab reviewId="rev1" orchestrationId="orch1" />)

    await user.type(screen.getByLabelText("Comment summary"), "My finding")
    await user.type(screen.getByLabelText("Comment body"), "Details here")
    await user.click(screen.getByRole("button", { name: "Comment" }))

    expect(mockCreateThread).toHaveBeenCalledWith({
      reviewId: "rev1",
      orchestrationId: "orch1",
      summary: "My finding",
      body: "Details here",
      source: "human",
      filePath: "",
      line: 0,
      commitSha: "",
      severity: "p2",
      author: "human",
      gateImpact: "review",
    })
  })

  it("shows severity with appropriate visual treatment", () => {
    const threads = [
      buildReviewThread({
        _id: "t1",
        summary: "Critical bug",
        severity: "p0",
      }),
      buildReviewThread({
        _id: "t2",
        summary: "Warning issue",
        severity: "p1",
      }),
      buildReviewThread({
        _id: "t3",
        summary: "Minor note",
        severity: "p2",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess(threads),
      },
    })

    render(<ConversationTab reviewId="rev1" orchestrationId="orch1" />)

    const badges = screen.getAllByTestId("severity-badge")
    expect(badges).toHaveLength(3)

    // p0 = red
    expect(badges[0]).toHaveClass("bg-red-900/30")
    expect(badges[0]).toHaveTextContent("p0")

    // p1 = yellow
    expect(badges[1]).toHaveClass("bg-yellow-900/30")
    expect(badges[1]).toHaveTextContent("p1")

    // p2 = grey
    expect(badges[2]).toHaveClass("bg-zinc-800")
    expect(badges[2]).toHaveTextContent("p2")
  })

  it("clears composer inputs after successful submit", async () => {
    const user = userEvent.setup()

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewThreads.list": querySuccess([]),
      },
    })

    render(<ConversationTab reviewId="rev1" orchestrationId="orch1" />)

    const summaryInput = screen.getByLabelText("Comment summary")
    const bodyInput = screen.getByLabelText("Comment body")

    await user.type(summaryInput, "My finding")
    await user.type(bodyInput, "Details here")
    await user.click(screen.getByRole("button", { name: "Comment" }))

    expect(summaryInput).toHaveValue("")
    expect(bodyInput).toHaveValue("")
  })
})
