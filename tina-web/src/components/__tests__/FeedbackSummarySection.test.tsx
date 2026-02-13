import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { FeedbackSummarySection } from "../FeedbackSummarySection"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

describe("FeedbackSummarySection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows loading state", () => {
    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("shows error state", () => {
    mockUseTypedQuery.mockReturnValue({ status: "error", error: new Error("fail") })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText(/failed to load feedback/i)).toBeInTheDocument()
  })

  it("shows zero count when no blocking entries", () => {
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: { openAskForChangeCount: 0, entries: [] },
    })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("shows blocking count badge when entries exist", () => {
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: { openAskForChangeCount: 3, entries: [{}, {}, {}] },
    })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("renders with Feedback title", () => {
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: { openAskForChangeCount: 0, entries: [] },
    })

    render(<FeedbackSummarySection orchestrationId="orch1" />)

    expect(screen.getByText("Feedback")).toBeInTheDocument()
  })
})
