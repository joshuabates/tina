import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Option } from "effect"
import { ReviewSection } from "../ReviewSection"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import type { OrchestrationEvent, OrchestrationDetail } from "@/schemas"

// Mock hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery")
).useTypedQuery
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable

describe("ReviewSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
    })
  })

  const createMockDetail = (overrides?: Partial<OrchestrationDetail>): OrchestrationDetail => ({
    _id: "orch1",
    _creationTime: 1234567890,
    nodeId: "node1",
    featureName: "test-feature",
    designDocPath: "/docs/test.md",
    branch: "tina/test-feature",
    worktreePath: Option.none(),
    totalPhases: 3,
    currentPhase: 1,
    status: "executing",
    startedAt: "2024-01-01T10:00:00Z",
    completedAt: Option.none(),
    totalElapsedMins: Option.none(),
    nodeName: "test-node",
    phases: [],
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [],
    ...overrides,
  })

  it("renders loading state while events are fetching", () => {
    const detail = createMockDetail()
    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    render(<ReviewSection detail={detail} />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("shows review events for orchestration", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      {
        _id: "evt1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "phase_review_requested",
        source: "supervisor",
        summary: "Review requested for phase 1",
        detail: Option.none(),
        recordedAt: "2024-01-01T10:00:00Z",
      },
      {
        _id: "evt2",
        _creationTime: 1234567891,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "phase_review_approved",
        source: "reviewer",
        summary: "Phase 1 approved",
        detail: Option.some("All tests passing"),
        recordedAt: "2024-01-01T10:05:00Z",
      },
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<ReviewSection detail={detail} />)

    expect(screen.getByText("Review requested for phase 1")).toBeInTheDocument()
    expect(screen.getByText("Phase 1 approved")).toBeInTheDocument()
  })

  it("filters events by phase_review_* type", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      {
        _id: "evt1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "phase_review_requested",
        source: "supervisor",
        summary: "Review requested",
        detail: Option.none(),
        recordedAt: "2024-01-01T10:00:00Z",
      },
      {
        _id: "evt2",
        _creationTime: 1234567891,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "task_created",
        source: "system",
        summary: "Task 1 created",
        detail: Option.none(),
        recordedAt: "2024-01-01T10:01:00Z",
      },
      {
        _id: "evt3",
        _creationTime: 1234567892,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "phase_review_completed",
        source: "reviewer",
        summary: "Review completed",
        detail: Option.none(),
        recordedAt: "2024-01-01T10:10:00Z",
      },
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<ReviewSection detail={detail} />)

    // Should show review events
    expect(screen.getByText("Review requested")).toBeInTheDocument()
    expect(screen.getByText("Review completed")).toBeInTheDocument()

    // Should not show non-review events
    expect(screen.queryByText("Task 1 created")).not.toBeInTheDocument()
  })

  it("handles empty events state", () => {
    const detail = createMockDetail()
    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: [],
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<ReviewSection detail={detail} />)

    expect(screen.getByText(/no review events/i)).toBeInTheDocument()
  })

  it("handles empty state when no phase_review events exist", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      {
        _id: "evt1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "task_created",
        source: "system",
        summary: "Task 1 created",
        detail: Option.none(),
        recordedAt: "2024-01-01T10:00:00Z",
      },
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<ReviewSection detail={detail} />)

    expect(screen.getByText(/no review events/i)).toBeInTheDocument()
  })

  it("registers rightPanel.review focus section", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      {
        _id: "evt1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "phase_review_requested",
        source: "supervisor",
        summary: "Review requested",
        detail: Option.none(),
        recordedAt: "2024-01-01T10:00:00Z",
      },
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<ReviewSection detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.review", 1)
  })

  it("updates item count when review events change", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      {
        _id: "evt1",
        _creationTime: 1234567890,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "phase_review_requested",
        source: "supervisor",
        summary: "Review requested",
        detail: Option.none(),
        recordedAt: "2024-01-01T10:00:00Z",
      },
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    const { rerender } = render(<ReviewSection detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.review", 1)

    // Update with more events
    const moreEvents: OrchestrationEvent[] = [
      ...events,
      {
        _id: "evt2",
        _creationTime: 1234567891,
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "phase_review_approved",
        source: "reviewer",
        summary: "Review approved",
        detail: Option.none(),
        recordedAt: "2024-01-01T10:05:00Z",
      },
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: moreEvents,
    } as TypedQueryResult<OrchestrationEvent[]>)

    rerender(<ReviewSection detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.review", 2)
  })
})
