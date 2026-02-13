import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { FeedbackSection } from "../FeedbackSection"
import type { FeedbackEntry } from "@/schemas"

// Mock Convex hooks
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => {
      const mockFn = vi.fn()
      ;(mockFn as any).withOptimisticUpdate = vi.fn()
      return mockFn
    }),
  }
})

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const mockUseMutation = vi.mocked(
  (await import("convex/react")).useMutation,
)

function buildFeedbackEntry(overrides: Partial<Record<string, unknown>> = {}): FeedbackEntry {
  return {
    _id: "fb1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    targetType: "task",
    targetTaskId: Option.some("1"),
    targetCommitSha: Option.none(),
    entryType: "comment",
    body: "Looks good",
    authorType: "human",
    authorName: "alice",
    status: "open",
    resolvedBy: Option.none(),
    resolvedAt: Option.none(),
    createdAt: "2026-02-12T10:00:00Z",
    updatedAt: "2026-02-12T10:00:00Z",
    ...overrides,
  } as unknown as FeedbackEntry
}

describe("FeedbackSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows loading state", () => {
    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByTestId("feedback-section-loading")).toBeInTheDocument()
  })

  it("shows empty state when no entries", () => {
    mockUseTypedQuery.mockReturnValue({ status: "success", data: [] })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByText(/no feedback yet/i)).toBeInTheDocument()
  })

  it("renders feedback entries newest-first", () => {
    const entries = [
      buildFeedbackEntry({
        _id: "fb1",
        body: "First entry",
        createdAt: "2026-02-12T10:00:00Z",
      }),
      buildFeedbackEntry({
        _id: "fb2",
        body: "Second entry",
        createdAt: "2026-02-12T11:00:00Z",
      }),
    ]
    mockUseTypedQuery.mockReturnValue({ status: "success", data: entries })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByText("First entry")).toBeInTheDocument()
    expect(screen.getByText("Second entry")).toBeInTheDocument()

    const items = screen.getAllByRole("listitem")
    const texts = items.map((item) => item.textContent)
    const secondIdx = texts.findIndex((t) => t?.includes("Second entry"))
    const firstIdx = texts.findIndex((t) => t?.includes("First entry"))
    expect(secondIdx).toBeLessThan(firstIdx)
  })

  it("shows entry type badge on each entry", () => {
    const entries = [
      buildFeedbackEntry({ _id: "fb1", entryType: "ask_for_change", body: "Fix this" }),
    ]
    mockUseTypedQuery.mockReturnValue({ status: "success", data: entries })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByText("ask_for_change")).toBeInTheDocument()
  })

  it("shows resolve button for open entries", () => {
    const entries = [
      buildFeedbackEntry({ _id: "fb1", status: "open", body: "Open entry" }),
    ]
    mockUseTypedQuery.mockReturnValue({ status: "success", data: entries })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByRole("button", { name: /resolve/i })).toBeInTheDocument()
  })

  it("shows reopen button for resolved entries", () => {
    const entries = [
      buildFeedbackEntry({
        _id: "fb1",
        status: "resolved",
        resolvedBy: Option.some("bob"),
        body: "Resolved entry",
      }),
    ]
    mockUseTypedQuery.mockReturnValue({ status: "success", data: entries })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByRole("button", { name: /reopen/i })).toBeInTheDocument()
  })

  it("renders composer form with entry type selector", () => {
    mockUseTypedQuery.mockReturnValue({ status: "success", data: [] })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    expect(screen.getByPlaceholderText(/author name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/add feedback/i)).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: /entry type/i })).toBeInTheDocument()
  })

  it("submits new feedback entry via mutation", async () => {
    const user = userEvent.setup()
    const mockCreate = vi.fn().mockResolvedValue("new-id")
    mockUseMutation.mockReturnValue(mockCreate as any)
    mockUseTypedQuery.mockReturnValue({ status: "success", data: [] })

    render(
      <FeedbackSection
        orchestrationId="orch1"
        targetType="task"
        targetRef="1"
      />,
    )

    await user.type(screen.getByPlaceholderText(/author name/i), "alice")
    await user.type(screen.getByPlaceholderText(/add feedback/i), "Great work")
    await user.click(screen.getByRole("button", { name: /submit/i }))

    expect(mockCreate).toHaveBeenCalledOnce()
  })
})
