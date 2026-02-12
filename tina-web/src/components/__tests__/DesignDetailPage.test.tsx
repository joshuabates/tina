import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  some,
  none,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import type { DesignSummary } from "@/schemas"

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

function buildDesign(overrides: Partial<DesignSummary> = {}): DesignSummary {
  return {
    _id: "d1",
    _creationTime: 1234567890,
    projectId: "p1",
    designKey: "ALPHA-D1",
    title: "Authentication Flow",
    markdown: "# Auth\nDesign for auth flow",
    status: "draft",
    createdAt: "2024-01-01T10:00:00Z",
    updatedAt: "2024-01-01T12:00:00Z",
    archivedAt: none<string>(),
    complexityPreset: none<string>(),
    requiredMarkers: none<string[]>(),
    completedMarkers: none<string[]>(),
    phaseCount: none<number>(),
    phaseStructureValid: none<boolean>(),
    validationUpdatedAt: none<string>(),
    ...overrides,
  }
}

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
  "designs.get": querySuccess(buildDesign()),
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
  mockMutate.mockResolvedValue("d1")
})

describe("DesignDetailPage", () => {
  it("renders loading state", () => {
    renderApp("/pm/designs/d1?project=p1", {
      ...defaultStates,
      "designs.get": queryLoading(),
    })

    expect(screen.getByTestId("design-detail-loading")).toBeInTheDocument()
  })

  it("renders not found when design is null", () => {
    renderApp("/pm/designs/d1?project=p1", {
      ...defaultStates,
      "designs.get": querySuccess(null),
    })

    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it("renders design key and title", () => {
    renderApp("/pm/designs/d1?project=p1")

    expect(screen.getByText("ALPHA-D1")).toBeInTheDocument()
    expect(screen.getByText("Authentication Flow")).toBeInTheDocument()
  })

  it("renders status badge", () => {
    renderApp("/pm/designs/d1?project=p1")

    expect(screen.getByText("Draft")).toBeInTheDocument()
  })

  it("renders markdown body", () => {
    renderApp("/pm/designs/d1?project=p1")

    expect(screen.getByText(/Design for auth flow/)).toBeInTheDocument()
  })

  it("renders Submit for Review button when status is draft", () => {
    renderApp("/pm/designs/d1?project=p1")

    expect(screen.getByRole("button", { name: /submit for review/i })).toBeInTheDocument()
  })

  it("renders Approve and Return to Draft buttons when status is in_review", () => {
    renderApp("/pm/designs/d1?project=p1", {
      ...defaultStates,
      "designs.get": querySuccess(buildDesign({ status: "in_review" })),
    })

    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /return to draft/i })).toBeInTheDocument()
  })

  it("renders Archive button when status is approved", () => {
    renderApp("/pm/designs/d1?project=p1", {
      ...defaultStates,
      "designs.get": querySuccess(buildDesign({ status: "approved" })),
    })

    expect(screen.getByRole("button", { name: /archive/i })).toBeInTheDocument()
  })

  it("renders Unarchive button when status is archived", () => {
    renderApp("/pm/designs/d1?project=p1", {
      ...defaultStates,
      "designs.get": querySuccess(buildDesign({ status: "archived" })),
    })

    expect(screen.getByRole("button", { name: /unarchive/i })).toBeInTheDocument()
  })

  it("calls transitionDesign when transition button is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/pm/designs/d1?project=p1")

    await user.click(screen.getByRole("button", { name: /submit for review/i }))

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        designId: "d1",
        newStatus: "in_review",
      }),
    )
  })

  it("enters edit mode when Edit button is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/pm/designs/d1?project=p1")

    await user.click(screen.getByRole("button", { name: /^edit$/i }))

    expect(screen.getByLabelText("Title")).toHaveValue("Authentication Flow")
    expect(screen.getByLabelText("Content")).toHaveValue("# Auth\nDesign for auth flow")
  })

  it("saves edits when Save button is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/pm/designs/d1?project=p1")

    await user.click(screen.getByRole("button", { name: /^edit$/i }))

    const titleInput = screen.getByLabelText(/title/i)
    await user.clear(titleInput)
    await user.type(titleInput, "Updated Title")
    await user.click(screen.getByRole("button", { name: /save/i }))

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        designId: "d1",
        title: "Updated Title",
      }),
    )
  })

  it("exits edit mode when Cancel button is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/pm/designs/d1?project=p1")

    await user.click(screen.getByRole("button", { name: /^edit$/i }))
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument()
  })

  it("renders comment timeline", () => {
    renderApp("/pm/designs/d1?project=p1")

    expect(screen.getByText(/no comments/i)).toBeInTheDocument()
  })

  describe("validation section", () => {
    it("does not render when complexityPreset is none", () => {
      renderApp("/pm/designs/d1?project=p1")

      expect(screen.queryByTestId("validation-section")).not.toBeInTheDocument()
    })

    it("renders when complexityPreset is present", () => {
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({ complexityPreset: some("standard") }),
        ),
      })

      expect(screen.getByTestId("validation-section")).toBeInTheDocument()
    })

    it("displays complexity preset value", () => {
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({ complexityPreset: some("standard") }),
        ),
      })

      expect(screen.getByText("standard")).toBeInTheDocument()
    })

    it("displays phase count", () => {
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({
            complexityPreset: some("standard"),
            phaseCount: some(3),
          }),
        ),
      })

      expect(screen.getByText("3")).toBeInTheDocument()
    })

    it("displays phase structure validity as Valid", () => {
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({
            complexityPreset: some("standard"),
            phaseStructureValid: some(true),
          }),
        ),
      })

      expect(screen.getByText("Valid")).toBeInTheDocument()
    })

    it("displays phase structure validity as Invalid", () => {
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({
            complexityPreset: some("standard"),
            phaseStructureValid: some(false),
          }),
        ),
      })

      expect(screen.getByText("Invalid")).toBeInTheDocument()
    })

    it("renders marker checklist with required markers", () => {
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({
            complexityPreset: some("standard"),
            requiredMarkers: some(["success_criteria", "phase_structure"]),
            completedMarkers: some([]),
          }),
        ),
      })

      const checklist = screen.getByTestId("marker-checklist")
      expect(checklist).toBeInTheDocument()
      expect(screen.getByText("success criteria")).toBeInTheDocument()
      expect(screen.getByText("phase structure")).toBeInTheDocument()
    })

    it("shows completed markers as checked", () => {
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({
            complexityPreset: some("standard"),
            requiredMarkers: some(["success_criteria", "phase_structure"]),
            completedMarkers: some(["success_criteria"]),
          }),
        ),
      })

      const checkboxes = screen.getAllByRole("checkbox")
      expect(checkboxes[0]).toBeChecked()
      expect(checkboxes[1]).not.toBeChecked()
    })

    it("does not render marker checklist when requiredMarkers is empty", () => {
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({
            complexityPreset: some("standard"),
            requiredMarkers: some([]),
          }),
        ),
      })

      expect(screen.queryByTestId("marker-checklist")).not.toBeInTheDocument()
    })

    it("calls updateDesignMarkers when marker is toggled", async () => {
      const user = userEvent.setup()
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({
            complexityPreset: some("standard"),
            requiredMarkers: some(["success_criteria", "phase_structure"]),
            completedMarkers: some(["success_criteria"]),
          }),
        ),
      })

      // Toggle unchecked marker on
      const checkboxes = screen.getAllByRole("checkbox")
      await user.click(checkboxes[1])

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          designId: "d1",
          completedMarkers: ["success_criteria", "phase_structure"],
        }),
      )
    })

    it("calls updateDesignMarkers to remove marker when toggled off", async () => {
      const user = userEvent.setup()
      renderApp("/pm/designs/d1?project=p1", {
        ...defaultStates,
        "designs.get": querySuccess(
          buildDesign({
            complexityPreset: some("standard"),
            requiredMarkers: some(["success_criteria", "phase_structure"]),
            completedMarkers: some(["success_criteria"]),
          }),
        ),
      })

      // Toggle checked marker off
      const checkboxes = screen.getAllByRole("checkbox")
      await user.click(checkboxes[0])

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          designId: "d1",
          completedMarkers: [],
        }),
      )
    })
  })
})
