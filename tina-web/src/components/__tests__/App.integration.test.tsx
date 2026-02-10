import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within, waitFor } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import App from "../../App"
import {
  buildAppIntegrationFixture,
  buildOrchestrationDetail,
  buildOrchestrationSummary,
  buildPhase,
  buildProjectSummary,
  some,
} from "@/test/builders/domain"
import {
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const primaryFixture = buildAppIntegrationFixture({
  projects: [buildProjectSummary({ _id: "p1", orchestrationCount: 2 })],
  orchestrations: [
    buildOrchestrationSummary({
      _id: "abc123",
      projectId: some("p1"),
      featureName: "my-feature",
      branch: "tina/my-feature",
      currentPhase: 2,
      status: "executing",
    }),
  ],
})

const secondaryOrchestration = buildOrchestrationSummary({
  _id: "def456",
  _creationTime: 1234567891,
  projectId: some("p1"),
  featureName: "my-other-feature",
  designDocPath: "/docs/my-other-feature.md",
  branch: "tina/my-other-feature",
  currentPhase: 1,
  status: "planning",
})

const secondaryDetail = buildOrchestrationDetail({
  _id: "def456",
  nodeId: "n2",
  featureName: "my-other-feature",
  designDocPath: "/docs/my-other-feature.md",
  branch: "tina/my-other-feature",
  currentPhase: 1,
  phases: [
    buildPhase({
      _id: "def-phase1",
      orchestrationId: "def456",
      phaseNumber: "1",
      status: "planning",
    }),
  ],
  phaseTasks: { "1": [] },
  teamMembers: [],
})

const defaultProjects = primaryFixture.projects
const defaultOrchestrations = [
  ...primaryFixture.orchestrations,
  secondaryOrchestration,
]
const defaultDetails: Record<string, typeof primaryFixture.detail | null> = {
  abc123: primaryFixture.detail,
  def456: secondaryDetail,
}

interface QuerySetup {
  projects?: typeof defaultProjects
  orchestrations?: typeof defaultOrchestrations
  details?: Record<string, typeof primaryFixture.detail | null>
  overrides?: Partial<QueryStateMap>
}

function renderApp(route = "/", setup: QuerySetup = {}) {
  const projects = setup.projects ?? defaultProjects
  const orchestrations = setup.orchestrations ?? defaultOrchestrations
  const details = setup.details ?? defaultDetails

  const states = {
    "projects.list": querySuccess(projects),
    "orchestrations.list": querySuccess(orchestrations),
    ...setup.overrides,
  } satisfies QueryStateMap

  return renderWithAppRuntime(<App />, {
    route,
    mockUseTypedQuery,
    states,
    detailResults: Object.fromEntries(
      Object.entries(details).map(([orchestrationId, detail]) => [
        orchestrationId,
        querySuccess(detail),
      ]),
    ),
    detailFallback: querySuccess(null),
  })
}

function latestMain(): HTMLElement {
  const mains = screen.getAllByRole("main")
  return mains[mains.length - 1] as HTMLElement
}

function firstSidebarItem(): HTMLElement {
  const item = document.querySelector('[data-orchestration-id]') as HTMLElement | null
  expect(item).toBeTruthy()
  return item as HTMLElement
}

function expectFeaturePage(featureName: string, branch: string, main = latestMain()) {
  expect(within(main).getByText(featureName)).toBeInTheDocument()
  expect(within(main).getByText(branch)).toBeInTheDocument()
}

function expectPhaseTimeline(main = latestMain()) {
  for (const phase of primaryFixture.detail.phases) {
    expect(
      within(main).getByText(
        new RegExp(`P${phase.phaseNumber} Phase ${phase.phaseNumber}`, "i"),
      ),
    ).toBeInTheDocument()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("App - runtime-backed URL and selection flow", () => {
  it.each(["/", "/some/unknown/path"])(
    "renders shell and empty main state for route %s",
    (route) => {
      renderApp(route)

      expect(screen.getByRole("banner")).toBeInTheDocument()
      expect(screen.getByRole("navigation")).toBeInTheDocument()
      expect(screen.getByRole("main")).toBeInTheDocument()
      expect(screen.getByText(/select an orchestration/i)).toBeInTheDocument()
    },
  )

  it("shows orchestration page when URL contains orchestration selection", () => {
    renderApp("/?orch=abc123")

    expectFeaturePage("my-feature", "tina/my-feature")
    expectPhaseTimeline()
  })

  it("shows not found state for unknown orchestration ID", () => {
    renderApp("/?orch=invalid-999")
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it("clicking sidebar item updates selected orchestration content", async () => {
    const user = userEvent.setup()
    renderApp("/")

    expect(screen.getAllByText(/select an orchestration/i).length).toBeGreaterThan(0)

    await user.click(firstSidebarItem())

    await waitFor(() => {
      expectFeaturePage("my-feature", "tina/my-feature")
    })
  })

  it("deep-link with orch and phase selects phase-specific task view", () => {
    renderApp("/?orch=abc123&phase=phase2")

    expectFeaturePage("my-feature", "tina/my-feature")
    expect(screen.queryByText(/no phase selected/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no tasks for this phase/i)).toBeInTheDocument()
  })

  it("switching orchestrations clears phase selection via selection service", async () => {
    const user = userEvent.setup()
    renderApp("/?orch=abc123&phase=phase1")

    const otherItem = screen.getByText("my-other-feature")
    await user.click(otherItem)

    await waitFor(() => {
      expectFeaturePage("my-other-feature", "tina/my-other-feature")
      expect(screen.getAllByText(/no phase selected/i).length).toBeGreaterThan(0)
    })
  })
})
