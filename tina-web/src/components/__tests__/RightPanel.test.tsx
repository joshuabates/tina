import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import { RightPanel } from "../RightPanel"
import type { OrchestrationDetail, OrchestrationEvent } from "@/schemas"
import { buildOrchestrationDetail, buildOrchestrationEvent } from "@/test/builders/domain"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"
import { renderWithRuntime } from "@/test/harness/render"
// Mock hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery")
).useTypedQuery
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable")
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection")
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
    // Default mock for useTypedQuery (empty events)
    mockUseTypedQuery.mockReturnValue(querySuccess([]))
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

    // Mock empty events for GitOps
    mockUseTypedQuery.mockReturnValue(querySuccess([]))

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

    mockUseTypedQuery.mockReturnValue(querySuccess(events))

    renderWithRuntime(<RightPanel detail={detail} />)

    expect(screen.getByText("Git commit")).toBeInTheDocument()
    expect(screen.getByText("Review requested")).toBeInTheDocument()
  })

  it("shows loading states while events are fetching", () => {
    const detail = createMockDetail()
    mockUseTypedQuery.mockReturnValue(queryLoading())

    renderWithRuntime(<RightPanel detail={detail} />)

    expect(screen.getByText(/loading git activity/i)).toBeInTheDocument()
    expect(screen.getByText(/loading review events/i)).toBeInTheDocument()
  })

  it("throws query errors to parent error boundary", () => {
    const detail = createMockDetail()
    const error = new Error("Failed to load events")
    mockUseTypedQuery.mockReturnValue(queryError(error))

    expect(() => renderWithRuntime(<RightPanel detail={detail} />)).toThrow(error)
  })
})
