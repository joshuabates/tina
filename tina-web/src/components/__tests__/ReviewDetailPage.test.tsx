import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { ReviewDetailPage } from "../ReviewDetailPage"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"
import {
  buildReviewSummary,
  buildReviewGate,
} from "@/test/builders/domain/entities"
import { buildOrchestrationDetail } from "@/test/builders/domain/fixtures"
import { none, some } from "@/test/builders/domain/primitives"

vi.mock("@/hooks/useTypedQuery")
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return { ...mod, useMutation: vi.fn(() => vi.fn()) }
})
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>()
  return {
    ...mod,
    useParams: vi.fn(() => ({ orchestrationId: "orch1", reviewId: "rev1" })),
  }
})
vi.mock("../ConversationTab", () => ({
  ConversationTab: () => (
    <div data-testid="conversation-tab">ConversationTab</div>
  ),
}))
vi.mock("../ChecksTab", () => ({
  ChecksTab: () => <div data-testid="checks-tab">ChecksTab</div>,
}))
vi.mock("../ChangesTab", () => ({
  ChangesTab: () => <div data-testid="changes-tab">ChangesTab</div>,
}))

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewDetailPage />
    </MemoryRouter>,
  )
}

describe("ReviewDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading skeleton while review is loading", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": queryLoading(),
      },
    })

    renderPage()

    expect(screen.getByTestId("review-loading")).toBeInTheDocument()
  })

  it("shows review header with state badge and reviewer when loaded", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(buildReviewSummary({ state: "open" })),
        "reviewGates.list": querySuccess([]),
      },
      detailFallback: querySuccess(buildOrchestrationDetail()),
    })

    renderPage()

    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.getByText(/test-review-agent/)).toBeInTheDocument()
    expect(screen.getByText(/Started:/)).toBeInTheDocument()
  })

  it("shows gate indicators when gates are present", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(buildReviewSummary()),
        "reviewGates.list": querySuccess([
          buildReviewGate({
            _id: "g1",
            gateId: "plan",
            status: "approved",
          }),
          buildReviewGate({
            _id: "g2",
            gateId: "review",
            status: "pending",
          }),
          buildReviewGate({
            _id: "g3",
            gateId: "finalize",
            status: "blocked",
          }),
        ]),
      },
      detailFallback: querySuccess(buildOrchestrationDetail()),
    })

    renderPage()

    expect(screen.getByTestId("gate-indicators")).toBeInTheDocument()
    expect(screen.getByText("plan: approved")).toBeInTheDocument()
    expect(screen.getByText("review: pending")).toBeInTheDocument()
    expect(screen.getByText("finalize: blocked")).toBeInTheDocument()
  })

  it("shows all three tabs with Commits + Conversation active by default", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(buildReviewSummary()),
        "reviewGates.list": querySuccess([]),
      },
      detailFallback: querySuccess(buildOrchestrationDetail()),
    })

    renderPage()

    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveTextContent("Commits + Conversation")
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
    expect(tabs[1]).toHaveTextContent("Checks")
    expect(tabs[1]).toHaveAttribute("aria-selected", "false")
    expect(tabs[2]).toHaveTextContent("Changes")
    expect(tabs[2]).toHaveAttribute("aria-selected", "false")
  })

  it("shows conversation tab content by default", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(buildReviewSummary()),
        "reviewGates.list": querySuccess([]),
      },
      detailFallback: querySuccess(buildOrchestrationDetail()),
    })

    renderPage()

    expect(screen.getByTestId("conversation-tab")).toBeInTheDocument()
  })

  it("shows ChecksTab when switching to Checks tab", async () => {
    const user = userEvent.setup()
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(buildReviewSummary()),
        "reviewGates.list": querySuccess([]),
      },
      detailFallback: querySuccess(buildOrchestrationDetail()),
    })

    renderPage()

    await user.click(screen.getByText("Checks"))
    expect(screen.getByTestId("checks-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("conversation-tab")).not.toBeInTheDocument()
  })

  it("shows ChangesTab when switching to Changes tab", async () => {
    const user = userEvent.setup()
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(buildReviewSummary()),
        "reviewGates.list": querySuccess([]),
      },
      detailResults: {
        orch1: querySuccess(
          buildOrchestrationDetail({
            worktreePath: some("/tmp/worktree"),
            branch: "tina/my-feature",
          }),
        ),
      },
    })

    renderPage()

    await user.click(screen.getByText("Changes"))
    expect(screen.getByTestId("changes-tab")).toBeInTheDocument()
    expect(screen.queryByTestId("conversation-tab")).not.toBeInTheDocument()
  })

  it("shows not-found message when review is null", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(null),
        "reviewGates.list": querySuccess([]),
      },
      detailFallback: querySuccess(buildOrchestrationDetail()),
    })

    renderPage()

    expect(screen.getByText("Review not found")).toBeInTheDocument()
  })

  it("shows error boundary when query errors", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {})

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": queryError(new Error("Network error")),
      },
    })

    renderPage()

    expect(screen.getByRole("alert")).toBeInTheDocument()
    consoleSpy.mockRestore()
  })

  it("shows orchestration-level review when no phase number", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviews.detail": querySuccess(
          buildReviewSummary({ phaseNumber: none<string>() }),
        ),
        "reviewGates.list": querySuccess([]),
      },
      detailFallback: querySuccess(buildOrchestrationDetail()),
    })

    renderPage()

    expect(
      screen.getByRole("heading", { name: /Orchestration Review/ }),
    ).toBeInTheDocument()
  })
})
