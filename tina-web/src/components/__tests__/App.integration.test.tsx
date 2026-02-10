import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { Option } from "effect"
import App from "../../App"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import type { ProjectSummary, OrchestrationSummary } from "@/schemas"

// Mock all required hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseTypedQuery = vi.mocked(await import("@/hooks/useTypedQuery")).useTypedQuery
const mockUseFocusable = vi.mocked(await import("@/hooks/useFocusable")).useFocusable
const mockUseSelection = vi.mocked(await import("@/hooks/useSelection")).useSelection

describe("App - URL synchronization + selection flow", () => {
  const mockSelectOrchestration = vi.fn()
  const mockSelectPhase = vi.fn()

  const projects: ProjectSummary[] = [
    {
      _id: "p1",
      _creationTime: 1234567890,
      name: "Project Alpha",
      repoPath: "/path/to/alpha",
      createdAt: "2024-01-01T00:00:00Z",
      orchestrationCount: 1,
      latestFeature: null,
      latestStatus: null,
    },
  ]

  const orchestrations: OrchestrationSummary[] = [
    {
      _id: "abc123",
      _creationTime: 1234567890,
      nodeId: "n1",
      projectId: Option.some("p1"),
      featureName: "my-feature",
      designDocPath: "/docs/my-feature.md",
      branch: "tina/my-feature",
      worktreePath: Option.none(),
      totalPhases: 3,
      currentPhase: 2,
      status: "executing",
      startedAt: "2024-01-01T10:00:00Z",
      completedAt: Option.none(),
      totalElapsedMins: Option.none(),
      nodeName: "node1",
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock for useFocusable
    mockUseFocusable.mockReturnValue({
      isSectionFocused: false,
      activeIndex: -1,
    })

    // Default mock for useTypedQuery
    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return {
          status: "success",
          data: orchestrations,
        } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })
  })

  it("renders AppShell with Sidebar and placeholder content", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    // AppShell should be present
    expect(screen.getByRole("banner")).toBeInTheDocument() // header
    expect(screen.getByRole("navigation")).toBeInTheDocument() // sidebar
    expect(screen.getByRole("main")).toBeInTheDocument() // main content

    // Placeholder should show "Select an orchestration" when nothing selected
    expect(screen.getByText(/select an orchestration/i)).toBeInTheDocument()
  })

  it("placeholder shows selected feature name when orchestration selected", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    render(
      <MemoryRouter initialEntries={["/?orch=abc123"]}>
        <App />
      </MemoryRouter>
    )

    // Placeholder should show the feature name in an h1
    expect(screen.getByRole("heading", { name: /my-feature/i })).toBeInTheDocument()
  })

  it("placeholder shows empty state for invalid orchestration ID", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "invalid-999",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    render(
      <MemoryRouter initialEntries={["/?orch=invalid-999"]}>
        <App />
      </MemoryRouter>
    )

    // Should show "not found" or empty state
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it("clicking sidebar item updates placeholder content", async () => {
    const user = userEvent.setup()

    // Start with no selection
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { rerender, container } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    // Verify initial state - use getAllByText since rerender may create multiple elements
    expect(screen.getAllByText(/select an orchestration/i).length).toBeGreaterThan(0)

    // Simulate clicking an orchestration (which would trigger selectOrchestration)
    // Use getAllByText since "my-feature" appears in sidebar
    const orchestrationItems = screen.getAllByText("my-feature")
    await user.click(orchestrationItems[0])

    // Verify selectOrchestration was called
    expect(mockSelectOrchestration).toHaveBeenCalledWith("abc123")

    // Now simulate the selection hook updating (as it would after URL changes)
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    rerender(
      <MemoryRouter initialEntries={["/?orch=abc123"]}>
        <App />
      </MemoryRouter>
    )

    // Placeholder should now show the feature name in an h1 within main content
    const main = container.querySelector('main[role="main"]')
    const heading = within(main as HTMLElement).getByRole("heading", { name: /my-feature/i })
    expect(heading).toBeInTheDocument()
  })

  it("wildcard route renders AppShell and placeholder", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { container } = render(
      <MemoryRouter initialEntries={["/some/unknown/path"]}>
        <App />
      </MemoryRouter>
    )

    // Should still render AppShell - use getAllByRole since test may render multiple times
    expect(screen.getAllByRole("banner").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0)
    expect(screen.getAllByRole("main").length).toBeGreaterThan(0)

    // And placeholder content
    const main = container.querySelector('main[role="main"]')
    expect(main).toBeInTheDocument()
    expect(main).toHaveTextContent(/select an orchestration/i)
  })
})
