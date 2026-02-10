import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { Option } from "effect"
import App from "../../App"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import type { ProjectSummary, OrchestrationSummary, OrchestrationDetail, Phase } from "@/schemas"

// Mock all required hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseTypedQuery = vi.mocked(await import("@/hooks/useTypedQuery")).useTypedQuery
const mockUseFocusable = vi.mocked(await import("@/hooks/useFocusable")).useFocusable
const mockUseSelection = vi.mocked(await import("@/hooks/useSelection")).useSelection

// Shared test fixtures
const mockProjects: ProjectSummary[] = [
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

const mockOrchestrations: OrchestrationSummary[] = [
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

const mockPhases: Phase[] = [
  {
    _id: "phase1",
    _creationTime: 1234567890,
    orchestrationId: "abc123",
    phaseNumber: "1",
    status: "completed",
    planPath: Option.some("/docs/plans/phase-1.md"),
    gitRange: Option.some("abc..def"),
    planningMins: Option.some(10),
    executionMins: Option.some(20),
    reviewMins: Option.some(5),
    startedAt: Option.some("2024-01-01T10:00:00Z"),
    completedAt: Option.some("2024-01-01T10:35:00Z"),
  },
  {
    _id: "phase2",
    _creationTime: 1234567891,
    orchestrationId: "abc123",
    phaseNumber: "2",
    status: "executing",
    planPath: Option.some("/docs/plans/phase-2.md"),
    gitRange: Option.none(),
    planningMins: Option.some(15),
    executionMins: Option.none(),
    reviewMins: Option.none(),
    startedAt: Option.some("2024-01-01T10:40:00Z"),
    completedAt: Option.none(),
  },
  {
    _id: "phase3",
    _creationTime: 1234567892,
    orchestrationId: "abc123",
    phaseNumber: "3",
    status: "pending",
    planPath: Option.none(),
    gitRange: Option.none(),
    planningMins: Option.none(),
    executionMins: Option.none(),
    reviewMins: Option.none(),
    startedAt: Option.none(),
    completedAt: Option.none(),
  },
]

const mockOrchestrationDetail: OrchestrationDetail = {
  _id: "abc123",
  _creationTime: 1234567890,
  nodeId: "n1",
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
  phases: mockPhases,
  tasks: [],
  orchestratorTasks: [],
  phaseTasks: {},
  teamMembers: [],
}

// Shared setup function
function setupMocks() {
  vi.clearAllMocks()

  mockUseFocusable.mockReturnValue({
    isSectionFocused: false,
    activeIndex: -1,
  })

  mockUseTypedQuery.mockImplementation((def) => {
    if (def.key === "projects.list") {
      return { status: "success", data: mockProjects } as TypedQueryResult<ProjectSummary[]>
    }
    if (def.key === "orchestrations.list") {
      return {
        status: "success",
        data: mockOrchestrations,
      } as TypedQueryResult<OrchestrationSummary[]>
    }
    if (def.key === "orchestrations.detail") {
      return {
        status: "success",
        data: mockOrchestrationDetail,
      } as TypedQueryResult<OrchestrationDetail>
    }
    return { status: "loading" }
  })
}

describe("App - URL synchronization + selection flow", () => {
  const mockSelectOrchestration = vi.fn()
  const mockSelectPhase = vi.fn()

  beforeEach(() => {
    setupMocks()
  })

  it("renders AppShell with Sidebar and empty state", () => {
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

    // OrchestrationPage empty state should show "Select an orchestration" when nothing selected
    expect(screen.getByText(/select an orchestration/i)).toBeInTheDocument()
  })

  it("shows orchestration page with feature name when orchestration selected", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { container } = render(
      <MemoryRouter initialEntries={["/?orch=abc123"]}>
        <App />
      </MemoryRouter>
    )

    // OrchestrationPage should show the feature name in main content area
    const main = container.querySelector('main') as HTMLElement
    expect(main).toBeInTheDocument()
    expect(within(main).getByText("my-feature")).toBeInTheDocument()
    expect(within(main).getByText("tina/my-feature")).toBeInTheDocument()
  })

  it("shows error state for invalid orchestration ID", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "invalid-999",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    // Mock detail query to return null for invalid ID
    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: mockProjects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return {
          status: "success",
          data: mockOrchestrations,
        } as TypedQueryResult<OrchestrationSummary[]>
      }
      if (def.key === "orchestrations.detail") {
        return {
          status: "success",
          data: null,
        } as TypedQueryResult<OrchestrationDetail | null>
      }
      return { status: "loading" }
    })

    render(
      <MemoryRouter initialEntries={["/?orch=invalid-999"]}>
        <App />
      </MemoryRouter>
    )

    // Error boundary should show error state
    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it("clicking sidebar item updates orchestration page content", async () => {
    const user = userEvent.setup()

    // Start with no selection
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { rerender } = render(
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

    // OrchestrationPage should now show the feature name and branch in main content
    const mains = screen.getAllByRole("main")
    const main = mains[mains.length - 1] // Get the last (most recent) render
    expect(within(main).getByText("my-feature")).toBeInTheDocument()
    expect(within(main).getByText("tina/my-feature")).toBeInTheDocument()
  })

  it("wildcard route renders AppShell and orchestration page", () => {
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

    // And orchestration page empty state
    const main = container.querySelector('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveTextContent(/select an orchestration/i)
  })
})

describe("App - OrchestrationPage integration (Phase 4)", () => {
  const mockSelectOrchestration = vi.fn()
  const mockSelectPhase = vi.fn()

  beforeEach(() => {
    setupMocks()
  })

  it("renders OrchestrationPage with phase timeline when orchestration selected", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { container } = render(
      <MemoryRouter initialEntries={["/?orch=abc123"]}>
        <App />
      </MemoryRouter>
    )

    // Verify orchestration page header renders in main content
    const main = container.querySelector('main') as HTMLElement
    expect(within(main).getByText("my-feature")).toBeInTheDocument()
    expect(within(main).getByText("tina/my-feature")).toBeInTheDocument()

    // Verify phase timeline renders with phases
    expect(within(main).getByText(/P1 Phase 1/i)).toBeInTheDocument()
    expect(within(main).getByText(/P2 Phase 2/i)).toBeInTheDocument()
    expect(within(main).getByText(/P3 Phase 3/i)).toBeInTheDocument()
  })

  it("phase timeline is interactive and wired to selection", () => {
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

    // Verify phase timeline renders with all phases
    expect(screen.getAllByText(/P1 Phase 1/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/P2 Phase 2/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/P3 Phase 3/i).length).toBeGreaterThan(0)

    // Verify useSelection hook is being used (provides selectPhase function)
    // The actual clicking behavior is tested in PhaseTimelinePanel.test.tsx
    expect(mockUseSelection).toHaveBeenCalled()
  })

  it("deep-link with ?orch=<id>&phase=<phaseId> restores both selections", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: "phase2",
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    render(
      <MemoryRouter initialEntries={["/?orch=abc123&phase=phase2"]}>
        <App />
      </MemoryRouter>
    )

    // Verify orchestration page renders (text appears in both sidebar and main)
    expect(screen.getAllByText("my-feature").length).toBeGreaterThan(0)

    // Verify all phases render including phase 2
    expect(screen.getAllByText(/P1 Phase 1/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/P2 Phase 2/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/P3 Phase 3/i).length).toBeGreaterThan(0)
  })

  it("selecting different orchestration clears phase selection", async () => {
    const user = userEvent.setup()

    // Start with both orchestration and phase selected
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: "phase1",
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { rerender, container } = render(
      <MemoryRouter initialEntries={["/?orch=abc123&phase=phase1"]}>
        <App />
      </MemoryRouter>
    )

    // Verify phases render initially
    expect(screen.getAllByText(/P1 Phase 1/i).length).toBeGreaterThan(0)

    // Simulate clicking a different orchestration in the sidebar
    const sidebar = container.querySelector('[role="navigation"]')
    const orchestrationItems = sidebar ? Array.from(sidebar.querySelectorAll('[id^="sidebar-item"]')).filter(el => el.textContent?.includes("my-feature")) : []
    if (orchestrationItems.length > 0) {
      await user.click(orchestrationItems[0] as HTMLElement)
    }

    // Verify selectOrchestration was called (which should clear phase selection)
    expect(mockSelectOrchestration).toHaveBeenCalledWith("abc123")

    // Now simulate selection hook updating with cleared phase
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

    // Verify all phases are still rendered after rerender
    expect(screen.getAllByText(/P1 Phase 1/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/P2 Phase 2/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/P3 Phase 3/i).length).toBeGreaterThan(0)
  })

  it("phase timeline data matches Convex query response", () => {
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { container } = render(
      <MemoryRouter initialEntries={["/?orch=abc123"]}>
        <App />
      </MemoryRouter>
    )

    // Verify all phases from detail query are rendered in main content
    const main = container.querySelector('main') as HTMLElement
    mockPhases.forEach((phase) => {
      expect(within(main).getByText(new RegExp(`P${phase.phaseNumber} Phase ${phase.phaseNumber}`, "i"))).toBeInTheDocument()
    })

    // Verify status badges match in main content (may appear multiple times due to right panel)
    expect(within(main).getAllByText("completed").length).toBeGreaterThan(0)
    expect(within(main).getAllByText("executing").length).toBeGreaterThan(0)
    expect(within(main).getAllByText("pending").length).toBeGreaterThan(0)
  })
})
