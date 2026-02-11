import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { TelemetryTimeline } from "../TelemetryTimeline"
import { buildOrchestrationEvent } from "@/test/builders/domain"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

describe("TelemetryTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state while fetching events", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": queryLoading(),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("renders error state when query fails", () => {
    const error = new Error("Failed to fetch events")
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": queryError(error),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    expect(screen.getByText(/error/i)).toBeInTheDocument()
  })

  it("renders empty state when no events exist", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess([]),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    expect(screen.getByText(/no telemetry events/i)).toBeInTheDocument()
  })

  it("groups events by phase number", () => {
    const events = [
      buildOrchestrationEvent({
        _id: "event1",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "state.transition",
        summary: "Phase 1 started",
        recordedAt: "2024-01-01T10:00:00Z",
      }),
      buildOrchestrationEvent({
        _id: "event2",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "projection.write",
        summary: "Task written",
        recordedAt: "2024-01-01T10:01:00Z",
      }),
      buildOrchestrationEvent({
        _id: "event3",
        orchestrationId: "orch1",
        phaseNumber: Option.some("2"),
        eventType: "state.transition",
        summary: "Phase 2 started",
        recordedAt: "2024-01-01T11:00:00Z",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess(events),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    expect(screen.getByText("Phase 1")).toBeInTheDocument()
    expect(screen.getByText("Phase 2")).toBeInTheDocument()
  })

  it("shows event summaries in chronological order", () => {
    const events = [
      buildOrchestrationEvent({
        _id: "event1",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "state.transition",
        summary: "Phase started",
        recordedAt: "2024-01-01T10:00:00Z",
      }),
      buildOrchestrationEvent({
        _id: "event2",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "projection.write",
        summary: "Data written",
        recordedAt: "2024-01-01T10:01:00Z",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess(events),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    expect(screen.getByText("Phase started")).toBeInTheDocument()
    expect(screen.getByText("Data written")).toBeInTheDocument()
  })

  it("applies color coding by event type", () => {
    const events = [
      buildOrchestrationEvent({
        _id: "event1",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "state.transition",
        summary: "State transition",
        recordedAt: "2024-01-01T10:00:00Z",
      }),
      buildOrchestrationEvent({
        _id: "event2",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "projection.write",
        summary: "Projection write",
        recordedAt: "2024-01-01T10:01:00Z",
      }),
      buildOrchestrationEvent({
        _id: "event3",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "projection.skip",
        summary: "Projection skip",
        recordedAt: "2024-01-01T10:02:00Z",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess(events),
      },
    })

    const { container } = render(<TelemetryTimeline orchestrationId="orch1" />)

    const stateEvent = container.querySelector('[data-event-type="state.transition"]')
    const writeEvent = container.querySelector('[data-event-type="projection.write"]')
    const skipEvent = container.querySelector('[data-event-type="projection.skip"]')

    expect(stateEvent).toBeInTheDocument()
    expect(writeEvent).toBeInTheDocument()
    expect(skipEvent).toBeInTheDocument()
  })

  it("collapses and expands phase sections", async () => {
    const user = userEvent.setup()
    const events = [
      buildOrchestrationEvent({
        _id: "event1",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "state.transition",
        summary: "Phase started",
        recordedAt: "2024-01-01T10:00:00Z",
      }),
      buildOrchestrationEvent({
        _id: "event2",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "projection.write",
        summary: "Data written",
        recordedAt: "2024-01-01T10:01:00Z",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess(events),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    const phaseHeader = screen.getByText("Phase 1")
    expect(screen.getByText("Phase started")).toBeInTheDocument()
    expect(screen.getByText("Data written")).toBeInTheDocument()

    // Click to collapse
    await user.click(phaseHeader)

    expect(screen.queryByText("Phase started")).not.toBeInTheDocument()
    expect(screen.queryByText("Data written")).not.toBeInTheDocument()

    // Click to expand
    await user.click(phaseHeader)

    expect(screen.getByText("Phase started")).toBeInTheDocument()
    expect(screen.getByText("Data written")).toBeInTheDocument()
  })

  it("formats recordedAt timestamps", () => {
    const events = [
      buildOrchestrationEvent({
        _id: "event1",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "state.transition",
        summary: "Phase started",
        recordedAt: "2024-01-01T10:00:00Z",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess(events),
      },
    })

    const { container } = render(<TelemetryTimeline orchestrationId="orch1" />)

    const timestamp = container.querySelector('[data-testid="event-timestamp"]')
    expect(timestamp).toBeInTheDocument()
    expect(timestamp?.textContent).toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it("handles events without phase numbers in separate section", () => {
    const events = [
      buildOrchestrationEvent({
        _id: "event1",
        orchestrationId: "orch1",
        phaseNumber: Option.none(),
        eventType: "state.transition",
        summary: "Orchestration started",
        recordedAt: "2024-01-01T10:00:00Z",
      }),
      buildOrchestrationEvent({
        _id: "event2",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "state.transition",
        summary: "Phase 1 started",
        recordedAt: "2024-01-01T10:01:00Z",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess(events),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    expect(screen.getByText("Orchestration")).toBeInTheDocument()
    expect(screen.getByText("Phase 1")).toBeInTheDocument()
    expect(screen.getByText("Orchestration started")).toBeInTheDocument()
    expect(screen.getByText("Phase 1 started")).toBeInTheDocument()
  })

  it("shows event source in event details", () => {
    const events = [
      buildOrchestrationEvent({
        _id: "event1",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "state.transition",
        source: "tina-session",
        summary: "Phase started",
        recordedAt: "2024-01-01T10:00:00Z",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess(events),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    expect(screen.getByText("tina-session")).toBeInTheDocument()
  })

  it("expands all phases by default", () => {
    const events = [
      buildOrchestrationEvent({
        _id: "event1",
        orchestrationId: "orch1",
        phaseNumber: Option.some("1"),
        eventType: "state.transition",
        summary: "Phase 1 event",
        recordedAt: "2024-01-01T10:00:00Z",
      }),
      buildOrchestrationEvent({
        _id: "event2",
        orchestrationId: "orch1",
        phaseNumber: Option.some("2"),
        eventType: "state.transition",
        summary: "Phase 2 event",
        recordedAt: "2024-01-01T11:00:00Z",
      }),
    ]

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess(events),
      },
    })

    render(<TelemetryTimeline orchestrationId="orch1" />)

    expect(screen.getByText("Phase 1 event")).toBeInTheDocument()
    expect(screen.getByText("Phase 2 event")).toBeInTheDocument()
  })
})
