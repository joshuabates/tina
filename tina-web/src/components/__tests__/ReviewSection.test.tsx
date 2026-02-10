import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ReviewSection } from "../ReviewSection"
import { buildOrchestrationEvent, none, some } from "@/test/builders/domain"
import { focusableState } from "@/test/harness/hooks"
import type { OrchestrationEvent } from "@/schemas"

vi.mock("@/hooks/useFocusable")

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable

function reviewEvent(
  eventType: OrchestrationEvent["eventType"] = "phase_review_requested",
  summary = "Review requested",
  overrides: Partial<OrchestrationEvent> = {},
): OrchestrationEvent {
  return buildOrchestrationEvent({
    _id: "evt1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: some("1"),
    eventType,
    source: "supervisor",
    summary,
    detail: none<string>(),
    recordedAt: "2024-01-01T10:00:00Z",
    ...overrides,
  })
}

function renderWithEvents(events: OrchestrationEvent[]) {
  return render(<ReviewSection reviewEvents={events} isLoading={false} />)
}

describe("ReviewSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseFocusable.mockReturnValue(focusableState())
  })

  it("renders loading state while events are fetching", () => {
    render(<ReviewSection reviewEvents={[]} isLoading />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("shows review events for orchestration", () => {
    renderWithEvents([
      reviewEvent("phase_review_requested", "Review requested for phase 1"),
      reviewEvent("phase_review_approved", "Phase 1 approved", {
        _id: "evt2",
        _creationTime: 1234567891,
        source: "reviewer",
        detail: some("All tests passing"),
        recordedAt: "2024-01-01T10:05:00Z",
      }),
    ])

    expect(screen.getByText("Review requested for phase 1")).toBeInTheDocument()
    expect(screen.getByText("Phase 1 approved")).toBeInTheDocument()
  })

  it("renders provided review events", () => {
    renderWithEvents([
      reviewEvent(),
      reviewEvent("phase_review_completed", "Review completed", {
        _id: "evt3",
        _creationTime: 1234567892,
        source: "reviewer",
        recordedAt: "2024-01-01T10:10:00Z",
      }),
    ])

    expect(screen.getByText("Review requested")).toBeInTheDocument()
    expect(screen.getByText("Review completed")).toBeInTheDocument()
  })

  it("shows empty state when event list is empty", () => {
    renderWithEvents([])

    expect(screen.getByText(/no review events yet/i)).toBeInTheDocument()
  })

  it("registers rightPanel.review focus section", () => {
    renderWithEvents([reviewEvent()])

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.review", 1)
  })

  it("updates item count when review events change", () => {
    const { rerender } = renderWithEvents([reviewEvent()])

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.review", 1)

    rerender(
      <ReviewSection
        reviewEvents={[
          reviewEvent(),
          reviewEvent("phase_review_approved", "Review approved", {
            _id: "evt2",
            _creationTime: 1234567891,
            source: "reviewer",
            recordedAt: "2024-01-01T10:05:00Z",
          }),
        ]}
        isLoading={false}
      />,
    )

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.review", 2)
  })

  it("review action button has accessible aria-label", () => {
    renderWithEvents([reviewEvent()])

    const reviewButton = screen.getByRole("button", { name: "Review and approve phase" })
    expect(reviewButton).toBeInTheDocument()
    expect(reviewButton).toHaveAccessibleName("Review and approve phase")
  })
})
