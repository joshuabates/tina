import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Option } from "effect"
import { GitOpsSection } from "../GitOpsSection"
import type { OrchestrationDetail, OrchestrationEvent } from "@/schemas"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"

// Mock hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery")
).useTypedQuery
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable

describe("GitOpsSection", () => {
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

  const createMockEvent = (overrides?: Partial<OrchestrationEvent>): OrchestrationEvent => ({
    _id: "event1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: Option.some("1"),
    eventType: "git_commit",
    source: "tina-session",
    summary: "Add user authentication",
    detail: Option.some("abc1234"),
    recordedAt: "2024-01-01T10:00:00Z",
    ...overrides,
  })

  it("renders recent commits from git events", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      createMockEvent({
        _id: "event1",
        eventType: "git_commit",
        summary: "Add user authentication",
        detail: Option.some("abc1234"),
      }),
      createMockEvent({
        _id: "event2",
        eventType: "git_commit",
        summary: "Fix login bug",
        detail: Option.some("def5678"),
      }),
      createMockEvent({
        _id: "event3",
        eventType: "task_created", // Non-git event, should be filtered out
        summary: "Task created",
        detail: Option.none(),
      }),
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    // Should show git commits
    expect(screen.getByText("Add user authentication")).toBeInTheDocument()
    expect(screen.getByText("Fix login bug")).toBeInTheDocument()
    expect(screen.getByText("abc1234")).toBeInTheDocument()
    expect(screen.getByText("def5678")).toBeInTheDocument()

    // Should not show non-git event
    expect(screen.queryByText("Task created")).not.toBeInTheDocument()
  })

  it("renders diff summary from git_diff events", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      createMockEvent({
        _id: "event1",
        eventType: "git_diff",
        summary: "Changes in 3 files",
        detail: Option.some("+42 -15"),
      }),
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    expect(screen.getByText("Changes in 3 files")).toBeInTheDocument()
    expect(screen.getByText("+42 -15")).toBeInTheDocument()
  })

  it("handles empty events (no git operations yet)", () => {
    const detail = createMockDetail()

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: [],
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    expect(screen.getByText(/no git activity/i)).toBeInTheDocument()
  })

  it("handles events with no git operations", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      createMockEvent({
        _id: "event1",
        eventType: "task_created",
        summary: "Task created",
        detail: Option.none(),
      }),
      createMockEvent({
        _id: "event2",
        eventType: "phase_started",
        summary: "Phase started",
        detail: Option.none(),
      }),
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    expect(screen.getByText(/no git activity/i)).toBeInTheDocument()
  })

  it("renders commit hash in monospace font", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      createMockEvent({
        _id: "event1",
        eventType: "git_commit",
        summary: "Add feature",
        detail: Option.some("abc1234"),
      }),
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    // Find the commit hash element
    const hashElement = screen.getByText("abc1234")
    // Check it has font-mono class (MonoText adds this)
    expect(hashElement.className).toMatch(/font-mono/)
  })

  it("renders diff stats in monospace font", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      createMockEvent({
        _id: "event1",
        eventType: "git_diff",
        summary: "Changes",
        detail: Option.some("+10 -5"),
      }),
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    // Find the diff stats element
    const statsElement = screen.getByText("+10 -5")
    // Check it has font-mono class (MonoText adds this)
    expect(statsElement.className).toMatch(/font-mono/)
  })

  it("handles git events with missing detail", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      createMockEvent({
        _id: "event1",
        eventType: "git_commit",
        summary: "Add feature",
        detail: Option.none(),
      }),
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    expect(screen.getByText("Add feature")).toBeInTheDocument()
    // Should show placeholder or just not show hash
    expect(screen.queryByText("abc1234")).not.toBeInTheDocument()
  })

  it("filters events by git_ prefix", () => {
    const detail = createMockDetail()
    const events: OrchestrationEvent[] = [
      createMockEvent({
        _id: "event1",
        eventType: "git_commit",
        summary: "Git commit",
        detail: Option.some("hash1"),
      }),
      createMockEvent({
        _id: "event2",
        eventType: "git_diff",
        summary: "Git diff",
        detail: Option.some("stats"),
      }),
      createMockEvent({
        _id: "event3",
        eventType: "git_push",
        summary: "Git push",
        detail: Option.some("remote"),
      }),
      createMockEvent({
        _id: "event4",
        eventType: "not_git",
        summary: "Non-git event",
        detail: Option.none(),
      }),
    ]

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: events,
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    // Should show all git_ events
    expect(screen.getByText("Git commit")).toBeInTheDocument()
    expect(screen.getByText("Git diff")).toBeInTheDocument()
    expect(screen.getByText("Git push")).toBeInTheDocument()

    // Should not show non-git event
    expect(screen.queryByText("Non-git event")).not.toBeInTheDocument()
  })

  it("uses PanelSection for layout with 'Git' label", () => {
    const detail = createMockDetail()

    mockUseTypedQuery.mockReturnValue({
      status: "success",
      data: [],
    } as TypedQueryResult<OrchestrationEvent[]>)

    render(<GitOpsSection detail={detail} />)

    expect(screen.getByText("Git")).toBeInTheDocument()
  })

  it("renders loading state while events are fetching", () => {
    const detail = createMockDetail()
    mockUseTypedQuery.mockReturnValue({ status: "loading" })

    render(<GitOpsSection detail={detail} />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it("throws query errors to parent error boundary", () => {
    const detail = createMockDetail()
    const error = new Error("Failed to load events")
    mockUseTypedQuery.mockReturnValue({
      status: "error",
      error,
    })

    expect(() => render(<GitOpsSection detail={detail} />)).toThrow(error)
  })
})
