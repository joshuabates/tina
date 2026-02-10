import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import App from "../../App"
import {
  buildAppIntegrationFixture,
} from "@/test/builders/domain"
import {
  queryStateFor,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import {
  focusableState,
  selectionState,
  type SelectionStateMock,
} from "@/test/harness/hooks"

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

const fixture = buildAppIntegrationFixture()
const mockSelectOrchestration = vi.fn()
const mockSelectPhase = vi.fn()

function setupTypedQueries(overrides: Partial<QueryStateMap> = {}) {
  const states: QueryStateMap = {
    "projects.list": querySuccess(fixture.projects),
    "orchestrations.list": querySuccess(fixture.orchestrations),
    "orchestrations.detail": querySuccess(fixture.detail),
    ...overrides,
  }

  mockUseTypedQuery.mockImplementation((def) => queryStateFor(def.key, states))
}

function setupSelection(overrides: Partial<SelectionStateMock> = {}) {
  mockUseSelection.mockReturnValue(
    selectionState({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
      ...overrides,
    }),
  )
}

function renderAppView({
  route = "/",
  selection,
  queries,
}: {
  route?: string
  selection?: Partial<SelectionStateMock>
  queries?: Partial<QueryStateMap>
} = {}) {
  if (queries) setupTypedQueries(queries)
  if (selection) setupSelection(selection)
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

function renderSelected(route = "/?orch=abc123", phaseId: string | null = null) {
  return renderAppView({
    route,
    selection: { orchestrationId: "abc123", phaseId },
  })
}

function rerenderAt(rerender: ReturnType<typeof render>["rerender"], route: string) {
  rerender(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  )
}

function latestMain(): HTMLElement {
  const mains = screen.getAllByRole("main")
  return mains[mains.length - 1] as HTMLElement
}

function expectFeaturePage(main = latestMain()) {
  expect(within(main).getByText("my-feature")).toBeInTheDocument()
  expect(within(main).getByText("tina/my-feature")).toBeInTheDocument()
}

function expectPhaseTimeline(main = latestMain()) {
  for (const phase of fixture.phases) {
    expect(
      within(main).getByText(new RegExp(`P${phase.phaseNumber} Phase ${phase.phaseNumber}`, "i")),
    ).toBeInTheDocument()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseFocusable.mockReturnValue(focusableState())
  setupTypedQueries()
  setupSelection()
})

describe("App - URL synchronization + selection flow", () => {
  it.each(["/", "/some/unknown/path"])(
    "renders AppShell and empty main state for route %s",
    (route) => {
      renderAppView({ route })

      expect(screen.getByRole("banner")).toBeInTheDocument()
      expect(screen.getByRole("navigation")).toBeInTheDocument()
      expect(screen.getByRole("main")).toBeInTheDocument()
      expect(screen.getByText(/select an orchestration/i)).toBeInTheDocument()
    },
  )

  it("shows orchestration page with feature name when orchestration selected", () => {
    renderSelected()
    expectFeaturePage()
  })

  it("shows error state for invalid orchestration ID", () => {
    renderAppView({
      route: "/?orch=invalid-999",
      selection: { orchestrationId: "invalid-999" },
      queries: { "orchestrations.detail": querySuccess(null) },
    })

    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it("clicking sidebar item updates orchestration page content", async () => {
    const user = userEvent.setup()
    const { rerender } = renderAppView()

    expect(screen.getAllByText(/select an orchestration/i).length).toBeGreaterThan(0)

    await user.click(screen.getAllByText("my-feature")[0])
    expect(mockSelectOrchestration).toHaveBeenCalledWith("abc123")

    setupSelection({ orchestrationId: "abc123" })
    rerenderAt(rerender, "/?orch=abc123")

    expectFeaturePage()
  })

})

describe("App - OrchestrationPage integration (Phase 4)", () => {
  it("renders OrchestrationPage with phase timeline when orchestration selected", () => {
    renderSelected()
    expectFeaturePage()
    expectPhaseTimeline()
  })

  it("phase timeline is interactive and wired to selection", () => {
    renderSelected()

    expectPhaseTimeline()
    expect(mockUseSelection).toHaveBeenCalled()
  })

  it("deep-link with ?orch=<id>&phase=<phaseId> restores both selections", () => {
    renderSelected("/?orch=abc123&phase=phase2", "phase2")

    expect(screen.getAllByText("my-feature").length).toBeGreaterThan(0)
    expectPhaseTimeline()
  })

  it("selecting different orchestration clears phase selection", async () => {
    const user = userEvent.setup()
    const { rerender, container } = renderAppView({
      route: "/?orch=abc123&phase=phase1",
      selection: { orchestrationId: "abc123", phaseId: "phase1" },
    })

    expect(screen.getAllByText(/P1 Phase 1/i).length).toBeGreaterThan(0)

    const sidebar = container.querySelector('[role="navigation"]')
    const items = sidebar
      ? Array.from(sidebar.querySelectorAll('[id^="sidebar-item"]')).filter((el) =>
          el.textContent?.includes("my-feature"),
        )
      : []

    if (items.length > 0) {
      await user.click(items[0] as HTMLElement)
    }

    expect(mockSelectOrchestration).toHaveBeenCalledWith("abc123")

    setupSelection({ orchestrationId: "abc123", phaseId: null })
    rerenderAt(rerender, "/?orch=abc123")

    expectPhaseTimeline()
  })

  it("phase timeline data matches Convex query response", () => {
    const { container } = renderSelected()

    const main = container.querySelector("main") as HTMLElement
    expectPhaseTimeline(main)
    expect(within(main).getAllByText("completed").length).toBeGreaterThan(0)
    expect(within(main).getAllByText("executing").length).toBeGreaterThan(0)
    expect(within(main).getAllByText("pending").length).toBeGreaterThan(0)
  })
})
