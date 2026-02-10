import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { Sidebar } from "../Sidebar"
import {
  buildOrchestrationSummary,
  buildProjectSummary,
  some,
} from "@/test/builders/domain"
import {
  queryStateFor,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { focusableState, selectionState } from "@/test/harness/hooks"
import { renderWithRouter } from "@/test/harness/render"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery
const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection

const mockSelectOrchestration = vi.fn()
const mockSelectPhase = vi.fn()

const projects = [
  buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 2 }),
]

const orchestrations = [
  buildOrchestrationSummary({ _id: "abc123", featureName: "feature-one", projectId: some("p1") }),
  buildOrchestrationSummary({
    _id: "xyz789",
    _creationTime: 1234567891,
    featureName: "feature-two",
    projectId: some("p1"),
    status: "complete",
    completedAt: some("2024-01-02T11:00:00Z"),
    totalElapsedMins: some(60),
  }),
]

function setQueryStates(overrides: Partial<QueryStateMap> = {}) {
  const states: QueryStateMap = {
    "projects.list": querySuccess(projects),
    "orchestrations.list": querySuccess(orchestrations),
    ...overrides,
  }

  mockUseTypedQuery.mockImplementation((def) => queryStateFor(def.key, states))
}

function setSelection(orchestrationId: string | null) {
  mockUseSelection.mockReturnValue(
    selectionState({
      orchestrationId,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    }),
  )
}

function renderSidebar(route = "/") {
  return renderWithRouter(<Sidebar />, route)
}

describe("Sidebar - Selection Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseFocusable.mockReturnValue(focusableState())
    setQueryStates()
    setSelection(null)
  })

  it("URL ?orch=abc123 highlights matching sidebar item", () => {
    setSelection("abc123")

    const { container } = renderSidebar("/?orch=abc123")

    expect(within(container).getByText("feature-one").closest("div")).toHaveClass("bg-muted/50")
  })

  it("clicking sidebar item updates URL via selectOrchestration", async () => {
    const user = userEvent.setup()
    const { container } = renderSidebar()

    await user.click(within(container).getByText("feature-one"))

    expect(mockSelectOrchestration).toHaveBeenCalledWith("abc123")
  })

  it("browser back restores previous selection", () => {
    setSelection("abc123")

    const { container, rerender } = renderSidebar("/?orch=abc123")
    expect(within(container).getByText("feature-one").closest("div")).toHaveClass("bg-muted/50")

    setSelection("xyz789")
    rerender(
      <MemoryRouter initialEntries={["/?orch=xyz789"]}>
        <Sidebar />
      </MemoryRouter>,
    )

    expect(within(container).getByText("feature-two").closest("div")).toHaveClass("bg-muted/50")
  })

  it.each([
    { label: "invalid orch ID", route: "/?orch=invalid-id-999", selection: "invalid-id-999" },
    { label: "missing orch ID", route: "/", selection: null },
  ])("shows sidebar without highlighted selection for $label", ({ route, selection }) => {
    setSelection(selection)

    const { container } = renderSidebar(route)

    expect(screen.getAllByText("Project Alpha").length).toBeGreaterThan(0)
    expect(screen.getAllByText("feature-one").length).toBeGreaterThan(0)
    expect(screen.getAllByText("feature-two").length).toBeGreaterThan(0)
    expect(container.querySelectorAll(".bg-muted\\/50")).toHaveLength(0)
  })
})
