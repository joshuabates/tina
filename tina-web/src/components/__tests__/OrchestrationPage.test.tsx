import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { OrchestrationPage } from "../OrchestrationPage"
import type { OrchestrationDetail } from "@/schemas"
import { buildOrchestrationDetail } from "@/test/builders/domain"
import { queryError, queryLoading, querySuccess } from "@/test/builders/query"
import { selectionState } from "@/test/harness/hooks"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useSelection")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection

vi.mock("../PhaseTimelinePanel", () => ({
  PhaseTimelinePanel: ({ detail }: { detail: OrchestrationDetail }) => (
    <div data-testid="phase-timeline-panel">Phase Timeline for {detail.featureName}</div>
  ),
}))

vi.mock("../TaskListPanel", () => ({
  TaskListPanel: ({ detail }: { detail: OrchestrationDetail }) => (
    <div data-testid="task-list-panel">Task List for {detail.featureName}</div>
  ),
}))

vi.mock("../RightPanel", () => ({
  RightPanel: ({ detail }: { detail: OrchestrationDetail }) => (
    <div data-testid="right-panel">Right Panel for {detail.featureName}</div>
  ),
}))

const baseOrchestration = buildOrchestrationDetail({
  _id: "o1",
  featureName: "test-feature",
  branch: "tina/test-feature",
  phases: [],
  phaseTasks: {},
  teamMembers: [],
})

type DetailQueryResult =
  | ReturnType<typeof queryLoading<OrchestrationDetail | null>>
  | ReturnType<typeof queryError<OrchestrationDetail | null>>
  | ReturnType<typeof querySuccess<OrchestrationDetail | null>>

function setSelection(orchestrationId: string | null) {
  mockUseSelection.mockReturnValue(
    selectionState({
      orchestrationId,
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
    }),
  )
}

function setQueryResult(result: DetailQueryResult) {
  mockUseTypedQuery.mockReturnValue(result)
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrchestrationPage />
    </MemoryRouter>,
  )
}

function renderScenario({
  orchestrationId = "o1",
  result = querySuccess<OrchestrationDetail | null>(baseOrchestration),
}: {
  orchestrationId?: string | null
  result?: DetailQueryResult
} = {}) {
  setSelection(orchestrationId)
  setQueryResult(result)
  return renderPage()
}

function withSuppressedConsoleError(run: () => void) {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    run()
  } finally {
    spy.mockRestore()
  }
}

function expectPanels(feature = "test-feature") {
  expect(screen.getByTestId("phase-timeline-panel")).toBeInTheDocument()
  expect(screen.getByText(new RegExp(`Phase Timeline for ${feature}`))).toBeInTheDocument()
  expect(screen.getByTestId("task-list-panel")).toBeInTheDocument()
  expect(screen.getByTestId("right-panel")).toBeInTheDocument()
}

describe("OrchestrationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders empty state when no orchestration selected", () => {
    setSelection(null)

    renderPage()

    expect(screen.getByText(/select an orchestration from the sidebar/i)).toBeInTheDocument()
  })

  it("renders loading state while query pending", () => {
    const { container } = renderScenario({ result: queryLoading<OrchestrationDetail | null>() })

    expect(container.querySelectorAll('[class*="skeletonBar"]').length).toBeGreaterThan(0)
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it("renders all panels when data loaded", () => {
    renderScenario()

    expectPanels()
    expect(screen.getByText(/Right Panel for test-feature/)).toBeInTheDocument()
  })

  it("shows orchestration feature name and branch in header", () => {
    const { container } = renderScenario()

    expect(container.textContent).toContain("test-feature")
    expect(container.textContent).toContain("tina/test-feature")
  })

  it("has aria-live region for status changes", () => {
    const { container } = renderScenario()

    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeInTheDocument()
    expect(liveRegion).toHaveAttribute("aria-atomic", "true")
  })

  it("throws to error boundary on query error", () => {
    withSuppressedConsoleError(() => {
      const { container } = renderScenario({
        result: queryError<OrchestrationDetail | null>(new Error("Query failed")),
      })

      expect(container.textContent).toContain("Unexpected error")
      expect(container.textContent).toContain("Something went wrong in orchestration")
    })
  })

  it("shows not-found state when OrchestrationDetailQuery returns null", () => {
    withSuppressedConsoleError(() => {
      const { container } = renderScenario({
        result: querySuccess<OrchestrationDetail | null>(null),
      })

      expect(container.textContent).toContain("orchestration not found")
    })
  })

  it("resets error boundary when selected orchestration changes", () => {
    withSuppressedConsoleError(() => {
      const { rerender, container } = renderScenario({
        result: querySuccess<OrchestrationDetail | null>(null),
      })

      expect(container.textContent).toContain("orchestration not found")

      setSelection("o2")
      setQueryResult(
        querySuccess<OrchestrationDetail | null>({
          ...baseOrchestration,
          _id: "o2",
          featureName: "next-feature",
          branch: "tina/next-feature",
        }),
      )

      rerender(
        <MemoryRouter>
          <OrchestrationPage />
        </MemoryRouter>,
      )

      expectPanels("next-feature")
    })
  })
})
