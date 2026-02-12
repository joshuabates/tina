import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import { RightPanel } from "../RightPanel"
import type { OrchestrationDetail, OrchestrationEvent } from "@/schemas"
import { buildOrchestrationDetail, buildOrchestrationEvent } from "@/test/builders/domain"
import { renderWithRuntime } from "@/test/harness/render"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess } from "@/test/builders/query"

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

vi.mock("@/hooks/useOrchestrationEvents")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const mockUseOrchestrationEvents = vi.mocked(
  await import("@/hooks/useOrchestrationEvents"),
).useOrchestrationEvents
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection

describe("RightPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
    })
    mockUseSelection.mockReturnValue({
      orchestrationId: "orch1",
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    })
    mockUseOrchestrationEvents.mockReturnValue({
      status: "success",
      isLoading: false,
      gitEvents: [],
      reviewEvents: [],
    })
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess([]),
      },
    })
  })

  const createMockDetail = (overrides?: Partial<OrchestrationDetail>): OrchestrationDetail =>
    buildOrchestrationDetail({ _id: "orch1", ...overrides })

  function event(overrides: Partial<OrchestrationEvent> = {}): OrchestrationEvent {
    return buildOrchestrationEvent({
      _id: "event1",
      orchestrationId: "orch1",
      eventType: "git_commit",
      summary: "Commit",
      ...overrides,
    })
  }

  it("renders all four sections", () => {
    const detail = createMockDetail()

    renderWithRuntime(<RightPanel detail={detail} />)

    // Should render all section labels
    expect(screen.getByText("Orchestration")).toBeInTheDocument()
    expect(screen.getByText("Orchestration Team")).toBeInTheDocument()
    expect(screen.getByText("Git Operations")).toBeInTheDocument()
    expect(screen.getByText("Phase Review")).toBeInTheDocument()
  })

  it("passes orchestration detail data to child sections", () => {
    const detail = createMockDetail({
      status: "reviewing",
      currentPhase: 2,
      totalPhases: 4,
    })

    renderWithRuntime(<RightPanel detail={detail} />)

    // StatusSection should show the status
    expect(screen.getByText("REVIEWING")).toBeInTheDocument()
    // StatusSection should show phase progress
    expect(screen.getByText(/PHASE 2\/4/i)).toBeInTheDocument()
  })

  it("handles empty state when no data available", () => {
    const detail = createMockDetail({
      teamMembers: [],
    })

    renderWithRuntime(<RightPanel detail={detail} />)

    // GitOps should show empty state
    expect(screen.getByText(/no git activity/i)).toBeInTheDocument()
    // Review should show empty state
    expect(screen.getByText(/no review events yet/i)).toBeInTheDocument()
  })

  it("has complementary landmark role for accessibility", () => {
    const detail = createMockDetail()

    renderWithRuntime(<RightPanel detail={detail} />)

    const rightPanel = screen.getByRole("complementary", { name: "Orchestration details" })
    expect(rightPanel).toBeInTheDocument()
  })

  it("passes git and review events to sections", () => {
    const detail = createMockDetail()
    const events = [
      event({ _id: "git1", eventType: "git_commit", summary: "Git commit" }),
      event({ _id: "rev1", eventType: "phase_review_requested", summary: "Review requested" }),
    ]

    mockUseOrchestrationEvents.mockReturnValue({
      status: "success",
      isLoading: false,
      gitEvents: [events[0]],
      reviewEvents: [events[1]],
    })

    renderWithRuntime(<RightPanel detail={detail} />)

    expect(screen.getByText("Git commit")).toBeInTheDocument()
    expect(screen.getByText("Review requested")).toBeInTheDocument()
  })

  it("shows loading states while events are fetching", () => {
    const detail = createMockDetail()
    mockUseOrchestrationEvents.mockReturnValue({
      status: "loading",
      isLoading: true,
      gitEvents: [],
      reviewEvents: [],
    })

    renderWithRuntime(<RightPanel detail={detail} />)

    expect(screen.getByText(/loading git activity/i)).toBeInTheDocument()
    expect(screen.getByText(/loading review events/i)).toBeInTheDocument()
  })

  it("throws query errors to parent error boundary", () => {
    const detail = createMockDetail()
    const error = new Error("Failed to load events")
    mockUseOrchestrationEvents.mockReturnValue({
      status: "error",
      isLoading: false,
      error,
      gitEvents: [],
      reviewEvents: [],
    })

    expect(() => renderWithRuntime(<RightPanel detail={detail} />)).toThrow(error)
  })
})
