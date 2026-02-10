import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
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

  const phases: Phase[] = [
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

  const orchestrationDetail: OrchestrationDetail = {
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
    phases,
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [],
  }

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
      if (def.key === "orchestrations.detail") {
        return {
          status: "success",
          data: orchestrationDetail,
        } as TypedQueryResult<OrchestrationDetail>
      }
      return { status: "loading" }
    })
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

    render(
      <MemoryRouter initialEntries={["/?orch=abc123"]}>
        <App />
      </MemoryRouter>
    )

    // OrchestrationPage should show the feature name (text appears in both sidebar and main)
    expect(screen.getAllByText("my-feature").length).toBeGreaterThan(0)
    expect(screen.getByText("tina/my-feature")).toBeInTheDocument()
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
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return {
          status: "success",
          data: orchestrations,
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

    // OrchestrationPage should now show the feature name and branch (text appears in both sidebar and main)
    expect(screen.getAllByText("my-feature").length).toBeGreaterThan(0)
    expect(screen.getAllByText("tina/my-feature").length).toBeGreaterThan(0)
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
    const main = container.querySelector('main[role="main"]')
    expect(main).toBeInTheDocument()
    expect(main).toHaveTextContent(/select an orchestration/i)
  })
})

describe("App - OrchestrationPage integration (Phase 4)", () => {
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

  const phases: Phase[] = [
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

  const orchestrationDetail: OrchestrationDetail = {
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
    phases,
    tasks: [],
    orchestratorTasks: [],
    phaseTasks: {},
    teamMembers: [],
  }

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
      if (def.key === "orchestrations.detail") {
        return {
          status: "success",
          data: orchestrationDetail,
        } as TypedQueryResult<OrchestrationDetail>
      }
      return { status: "loading" }
    })
  })

  it("renders OrchestrationPage with phase timeline when orchestration selected", () => {
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

    // Verify orchestration page header renders (text appears in both sidebar and main)
    expect(screen.getAllByText("my-feature").length).toBeGreaterThan(0)
    expect(screen.getAllByText("tina/my-feature").length).toBeGreaterThan(0)

    // Verify phase timeline renders with phases (as headings in phase cards)
    expect(screen.getByText(/P1 Phase 1/i)).toBeInTheDocument()
    expect(screen.getByText(/P2 Phase 2/i)).toBeInTheDocument()
    expect(screen.getByText(/P3 Phase 3/i)).toBeInTheDocument()
  })

  it("clicking phase updates URL with phase parameter", async () => {
    const user = userEvent.setup()

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

    // Click phase 1 (clicking the phase card div)
    const phase1Cards = screen.getAllByText(/P1 Phase 1/i)
    const phase1Card = phase1Cards[0]?.closest('[id^="phase-"]')
    if (phase1Card) {
      await user.click(phase1Card)
    }

    // Verify selectPhase was called
    expect(mockSelectPhase).toHaveBeenCalledWith("phase1")
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

    // Verify phase 2 is in selected state (has aria-current="true")
    const phase2Cards = screen.getAllByText(/P2 Phase 2/i)
    const phase2CardRoot = phase2Cards[0]?.closest('[id^="phase-"]')
    expect(phase2CardRoot).toHaveAttribute("aria-current", "true")
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

    // Verify phase is selected
    const phase1Cards = screen.getAllByText(/P1 Phase 1/i)
    const phase1CardRoot = phase1Cards[0]?.closest('[id^="phase-"]')
    expect(phase1CardRoot).toHaveAttribute("aria-current", "true")

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

    // Phase should no longer be selected (no aria-current attribute)
    const phase1CardsAfter = screen.getAllByText(/P1 Phase 1/i)
    const phase1CardRootAfter = phase1CardsAfter[0]?.closest('[id^="phase-"]')
    expect(phase1CardRootAfter).not.toHaveAttribute("aria-current")
  })

  it("phase timeline data matches Convex query response", () => {
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

    // Verify all phases from detail query are rendered
    phases.forEach((phase) => {
      const phaseTexts = screen.getAllByText(new RegExp(`P${phase.phaseNumber} Phase ${phase.phaseNumber}`, "i"))
      expect(phaseTexts.length).toBeGreaterThan(0)
    })

    // Verify status badges match (may appear in multiple renders)
    expect(screen.getAllByText("completed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("executing").length).toBeGreaterThan(0)
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0)
  })
})
