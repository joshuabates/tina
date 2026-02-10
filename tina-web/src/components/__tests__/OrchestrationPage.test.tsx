import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { OrchestrationPage } from "../OrchestrationPage"
import type { OrchestrationDetail } from "@/schemas"
import { buildOrchestrationDetail } from "@/test/builders/domain"
import { queryError, queryLoading, querySuccess, type QueryStateMap } from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import { useServices } from "@/providers/RuntimeProvider"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

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

function renderScenario({
  route = "/?orch=o1",
  detailResults = {
    o1: querySuccess<OrchestrationDetail | null>(baseOrchestration),
  },
  detailFallback = querySuccess<OrchestrationDetail | null>(null),
  states = {},
  includeHarness = false,
}: {
  route?: string
  detailResults?: Record<string, DetailQueryResult>
  detailFallback?: DetailQueryResult
  states?: Partial<QueryStateMap>
  includeHarness?: boolean
} = {}) {
  return renderWithAppRuntime(
    <>
      <OrchestrationPage />
      {includeHarness ? <SelectionHarness /> : null}
    </>,
    {
      route,
      states,
      detailResults,
      detailFallback,
      mockUseTypedQuery,
    },
  )
}

async function withSuppressedConsoleError(run: () => void | Promise<void>) {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {})
  try {
    await run()
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

function SelectionHarness() {
  const { selectionService } = useServices()

  return (
    <button onClick={() => selectionService.selectOrchestration("o2")}>
      select o2
    </button>
  )
}

describe("OrchestrationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders empty state when no orchestration selected", () => {
    renderScenario({ route: "/" })
    expect(screen.getByText(/select an orchestration from the sidebar/i)).toBeInTheDocument()
  })

  it("renders loading state while query pending", () => {
    const { container } = renderScenario({
      detailResults: {
        o1: queryLoading<OrchestrationDetail | null>(),
      },
    })

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

  it("throws to error boundary on query error", async () => {
    await withSuppressedConsoleError(() => {
      const { container } = renderScenario({
        detailResults: {
          o1: queryError<OrchestrationDetail | null>(new Error("Query failed")),
        },
      })

      expect(container.textContent).toContain("Unexpected error")
      expect(container.textContent).toContain("Something went wrong in orchestration")
    })
  })

  it("shows not-found state when OrchestrationDetailQuery returns null", async () => {
    await withSuppressedConsoleError(() => {
      const { container } = renderScenario({
        detailResults: {
          o1: querySuccess<OrchestrationDetail | null>(null),
        },
      })

      expect(container.textContent).toContain("orchestration not found")
    })
  })

  it("resets error boundary when selected orchestration changes", async () => {
    const user = userEvent.setup()

    await withSuppressedConsoleError(async () => {
      const nextOrchestration = {
        ...baseOrchestration,
        _id: "o2",
        featureName: "next-feature",
        branch: "tina/next-feature",
      }

      const { container } = renderScenario({
        includeHarness: true,
        detailResults: {
          o1: querySuccess<OrchestrationDetail | null>(null),
          o2: querySuccess<OrchestrationDetail | null>(nextOrchestration),
        },
      })

      expect(container.textContent).toContain("orchestration not found")

      await user.click(screen.getByRole("button", { name: "select o2" }))
      expectPanels("next-feature")
    })
  })
})
