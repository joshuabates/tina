import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  buildDesignSummary,
  buildDesignVariation,
  buildSpecSummary,
  some,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"

vi.mock("@/hooks/useTypedQuery")

const mockMutate = vi.fn()
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => mockMutate),
  }
})

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const projects = [
  buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 0 }),
]

const defaultStates: Partial<QueryStateMap> = {
  "projects.list": querySuccess(projects),
  "orchestrations.list": querySuccess([
    buildOrchestrationSummary({
      _id: "orch1",
      projectId: some("p1"),
      featureName: "test-feature",
      status: "executing",
    }),
  ]),
  "designs.get": querySuccess(buildDesignSummary()),
  "designVariations.list": querySuccess([]),
  "specDesigns.specsForDesign": querySuccess([]),
  "workComments.list": querySuccess([]),
}

function renderApp(route: string, states: Partial<QueryStateMap> = defaultStates) {
  return renderWithAppRuntime(<App />, {
    route,
    mockUseTypedQuery,
    states,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMutate.mockResolvedValue("design1")
})

describe("DesignDetailPage", () => {
  it("renders loading state", () => {
    renderApp("/projects/p1/plan/designs/design1", {
      ...defaultStates,
      "designs.get": queryLoading(),
    })

    expect(screen.getByTestId("design-detail-loading")).toBeInTheDocument()
  })

  it("renders not found when design is null", () => {
    renderApp("/projects/p1/plan/designs/design1", {
      ...defaultStates,
      "designs.get": querySuccess(null),
    })

    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it("renders design key and title", () => {
    renderApp("/projects/p1/plan/designs/design1")

    expect(screen.getByText("ALPHA-DES1")).toBeInTheDocument()
    expect(screen.getByText("Login Page Design")).toBeInTheDocument()
  })

  it("renders status badge", () => {
    renderApp("/projects/p1/plan/designs/design1")

    expect(screen.getByText("Exploring")).toBeInTheDocument()
  })

  it("renders prompt text", () => {
    renderApp("/projects/p1/plan/designs/design1")

    expect(screen.getByText("Design a login page with OAuth support")).toBeInTheDocument()
  })

  it("renders Lock button when status is exploring", () => {
    renderApp("/projects/p1/plan/designs/design1")

    expect(screen.getByRole("button", { name: /lock/i })).toBeInTheDocument()
  })

  it("renders Archive and Unlock buttons when status is locked", () => {
    renderApp("/projects/p1/plan/designs/design1", {
      ...defaultStates,
      "designs.get": querySuccess(buildDesignSummary({ status: "locked" })),
    })

    expect(screen.getByRole("button", { name: /archive/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /unlock/i })).toBeInTheDocument()
  })

  it("renders Reopen button when status is archived", () => {
    renderApp("/projects/p1/plan/designs/design1", {
      ...defaultStates,
      "designs.get": querySuccess(buildDesignSummary({ status: "archived" })),
    })

    expect(screen.getByRole("button", { name: /reopen/i })).toBeInTheDocument()
  })

  it("calls transitionDesign when transition button is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/projects/p1/plan/designs/design1")

    await user.click(screen.getByRole("button", { name: /lock/i }))

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        designId: "design1",
        newStatus: "locked",
      }),
    )
  })

  it("renders linked specs when present", () => {
    renderApp("/projects/p1/plan/designs/design1", {
      ...defaultStates,
      "specDesigns.specsForDesign": querySuccess([
        buildSpecSummary({ _id: "spec1", specKey: "ALPHA-D1", title: "Auth Spec" }),
      ]),
    })

    expect(screen.getByTestId("linked-specs-section")).toBeInTheDocument()
    expect(screen.getByText("ALPHA-D1")).toBeInTheDocument()
    expect(screen.getByText("Auth Spec")).toBeInTheDocument()
  })

  it("does not render linked specs section when empty", () => {
    renderApp("/projects/p1/plan/designs/design1")

    expect(screen.queryByTestId("linked-specs-section")).not.toBeInTheDocument()
  })

  it("renders variations section", () => {
    renderApp("/projects/p1/plan/designs/design1")

    expect(screen.getByTestId("variations-section")).toBeInTheDocument()
    expect(screen.getByText(/no variations/i)).toBeInTheDocument()
  })

  it("renders variations list when variations exist", () => {
    renderApp("/projects/p1/plan/designs/design1", {
      ...defaultStates,
      "designVariations.list": querySuccess([
        buildDesignVariation({
          _id: "v1",
          slug: "v1",
          title: "Minimal Login",
          status: "exploring",
        }),
        buildDesignVariation({
          _id: "v2",
          slug: "v2",
          title: "Full Featured Login",
          status: "selected",
        }),
      ]),
    })

    expect(screen.getByText("v1")).toBeInTheDocument()
    expect(screen.getByText("Minimal Login")).toBeInTheDocument()
    expect(screen.getByText("v2")).toBeInTheDocument()
    expect(screen.getByText("Full Featured Login")).toBeInTheDocument()
  })

  it("renders comment timeline", () => {
    renderApp("/projects/p1/plan/designs/design1")

    expect(screen.getByText(/no comments/i)).toBeInTheDocument()
  })
})
