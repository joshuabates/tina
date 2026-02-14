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

vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

vi.mock("../RightPanel", () => ({
  RightPanel: ({ detail }: { detail: { featureName: string } }) => (
    <div data-testid="right-panel">Right Panel for {detail.featureName}</div>
  ),
}))

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
  specDocPath: "/docs/my-other-feature.md",
  branch: "tina/my-other-feature",
  currentPhase: 1,
  status: "planning",
})

const secondaryDetail = buildOrchestrationDetail({
  _id: "def456",
  nodeId: "n2",
  featureName: "my-other-feature",
  specDocPath: "/docs/my-other-feature.md",
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
  const scoped = within(main.ownerDocument.body)
  expect(scoped.getAllByText(new RegExp(featureName, "i")).length).toBeGreaterThan(0)
  expect(scoped.getAllByText(new RegExp(branch, "i")).length).toBeGreaterThan(0)
}

function expectPhaseTimeline(main = latestMain()) {
  for (const phase of primaryFixture.detail.phases) {
    expect(
      within(main.ownerDocument.body).getByRole("button", {
        name: new RegExp(`phase ${phase.phaseNumber}`, "i"),
      }),
    ).toBeInTheDocument()
  }
}

function expectNoPhaseTimeline(main = latestMain()) {
  for (const phase of primaryFixture.detail.phases) {
    expect(
      within(main.ownerDocument.body).queryByRole("button", {
        name: new RegExp(`phase ${phase.phaseNumber}`, "i"),
      }),
    ).not.toBeInTheDocument()
  }
}

function expectPhaseTimelineFor(featurePhases: Array<{ phaseNumber: string }>, main = latestMain()) {
  for (const phase of featurePhases) {
    expect(
      within(main.ownerDocument.body).getByRole("button", {
        name: new RegExp(`phase ${phase.phaseNumber}`, "i"),
      }),
    ).toBeInTheDocument()
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe("App - runtime-backed URL and selection flow", () => {
  it.each(["/", "/some/unknown/path"])(
    "renders shell and empty main state for route %s",
    (route) => {
      renderApp(route)

      expect(screen.getByRole("navigation", { name: /mode rail/i })).toBeInTheDocument()
      expect(screen.getByRole("navigation", { name: /observe sidebar/i })).toBeInTheDocument()
      expect(screen.getByRole("main")).toBeInTheDocument()
      expect(screen.getByText(/select an orchestration/i)).toBeInTheDocument()
    },
  )

  it("shows orchestration page when URL contains orchestration selection", () => {
    renderApp("/projects/p1/observe?orch=abc123")

    expectFeaturePage("my-feature", "tina/my-feature")
    expectPhaseTimeline()
  })

  it("shows not found state for unknown orchestration ID", () => {
    renderApp("/projects/p1/observe?orch=invalid-999")
    expect(screen.getByText(/select an orchestration/i)).toBeInTheDocument()
    expectNoPhaseTimeline()
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
    renderApp("/projects/p1/observe?orch=abc123&phase=phase2")

    expectFeaturePage("my-feature", "tina/my-feature")
    expect(screen.queryByText(/no phase selected/i)).not.toBeInTheDocument()
    expect(screen.getByText(/no tasks for this phase/i)).toBeInTheDocument()
  })

  it("prefers non-temporary project when resolving root route", async () => {
    const projects = [
      buildProjectSummary({
        _id: "tmp1",
        name: ".tmpA1B2C3",
        repoPath: "/private/var/folders/yy/tmp/project",
        orchestrationCount: 0,
      }),
      buildProjectSummary({
        _id: "p-stable",
        name: "tina",
        repoPath: "/Users/joshua/Projects/tina",
        orchestrationCount: 1,
      }),
    ]

    renderApp("/", { projects })

    await waitFor(() => {
      expect(screen.getByTestId("project-picker")).toHaveValue("p-stable")
    })
  })

  it("switching orchestrations auto-selects phase of new orchestration", async () => {
    const user = userEvent.setup()
    renderApp("/projects/p1/observe?orch=abc123&phase=phase1")

    const otherItem = screen.getByText("my-other-feature")
    await user.click(otherItem)

    await waitFor(() => {
      expectFeaturePage("my-other-feature", "tina/my-other-feature")
      // Phase auto-selection picks the current phase of the new orchestration,
      // which has no tasks, so we see "No tasks for this phase"
      expect(screen.getByText(/no tasks for this phase/i)).toBeInTheDocument()
      expectPhaseTimelineFor(secondaryDetail.phases)
      expect(
        screen.queryByRole("button", { name: /phase 2/i }),
      ).not.toBeInTheDocument()
    })
  })
})
