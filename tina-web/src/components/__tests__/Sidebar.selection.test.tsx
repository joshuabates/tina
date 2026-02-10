import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { Option } from "effect"
import { Sidebar } from "../Sidebar"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import type { ProjectSummary, OrchestrationSummary } from "@/schemas"

// Mock hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

const mockUseTypedQuery = vi.mocked(await import("@/hooks/useTypedQuery")).useTypedQuery
const mockUseFocusable = vi.mocked(await import("@/hooks/useFocusable")).useFocusable
const mockUseSelection = vi.mocked(await import("@/hooks/useSelection")).useSelection

describe("Sidebar - Selection Flow", () => {
  const mockSelectOrchestration = vi.fn()
  const mockSelectPhase = vi.fn()

  const projects: ProjectSummary[] = [
    {
      _id: "p1",
      _creationTime: 1234567890,
      name: "Project Alpha",
      repoPath: "/path/to/alpha",
      createdAt: "2024-01-01T00:00:00Z",
      orchestrationCount: 2,
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
      featureName: "feature-one",
      designDocPath: "/docs/feature-one.md",
      branch: "tina/feature-one",
      worktreePath: Option.none(),
      totalPhases: 3,
      currentPhase: 1,
      status: "executing",
      startedAt: "2024-01-01T10:00:00Z",
      completedAt: Option.none(),
      totalElapsedMins: Option.none(),
      nodeName: "node1",
    },
    {
      _id: "xyz789",
      _creationTime: 1234567891,
      nodeId: "n1",
      projectId: Option.some("p1"),
      featureName: "feature-two",
      designDocPath: "/docs/feature-two.md",
      branch: "tina/feature-two",
      worktreePath: Option.none(),
      totalPhases: 2,
      currentPhase: 2,
      status: "complete",
      startedAt: "2024-01-02T10:00:00Z",
      completedAt: Option.some("2024-01-02T11:00:00Z"),
      totalElapsedMins: Option.some(60),
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

  it("URL ?orch=abc123 highlights matching sidebar item", () => {
    // Mock useSelection to return the orchestration ID from URL
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { container } = render(
      <MemoryRouter initialEntries={["/?orch=abc123"]}>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    // Find the orchestration item and check if it has the active class
    const orchestrationItem = within(container).getByText("feature-one")
    const itemContainer = orchestrationItem.closest("div")
    expect(itemContainer).toHaveClass("bg-muted/50")
  })

  it("clicking sidebar item updates URL via selectOrchestration", async () => {
    const user = userEvent.setup()

    // No selection initially
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { container } = render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    const orchestrationItem = within(container).getByText("feature-one")
    await user.click(orchestrationItem)

    // selectOrchestration should be called, which will update URL
    expect(mockSelectOrchestration).toHaveBeenCalledWith("abc123")
  })

  it("browser back restores previous selection", () => {
    // Simulate two consecutive renders with different orchestration IDs
    // This tests that the component responds to URL changes

    // First render: orchestration abc123 selected
    mockUseSelection.mockReturnValue({
      orchestrationId: "abc123",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { container, rerender } = render(
      <MemoryRouter initialEntries={["/?orch=abc123"]}>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    // Verify first orchestration is highlighted
    let orchestrationItem = within(container).getByText("feature-one")
    let itemContainer = orchestrationItem.closest("div")
    expect(itemContainer).toHaveClass("bg-muted/50")

    // Now simulate browser back: different orchestration selected
    mockUseSelection.mockReturnValue({
      orchestrationId: "xyz789",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    rerender(
      <MemoryRouter initialEntries={["/?orch=xyz789"]}>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    // Verify second orchestration is now highlighted
    orchestrationItem = within(container).getByText("feature-two")
    itemContainer = orchestrationItem.closest("div")
    expect(itemContainer).toHaveClass("bg-muted/50")
  })

  it("invalid orch ID shows empty state without crashing", () => {
    // Mock useSelection with an ID that doesn't exist
    mockUseSelection.mockReturnValue({
      orchestrationId: "invalid-id-999",
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    // Should not crash
    const { container } = render(
      <MemoryRouter initialEntries={["/?orch=invalid-id-999"]}>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    // Should still render the sidebar with projects
    expect(screen.getAllByText("Project Alpha").length).toBeGreaterThan(0)
    expect(screen.getAllByText("feature-one").length).toBeGreaterThan(0)
    expect(screen.getAllByText("feature-two").length).toBeGreaterThan(0)

    // But no item should be highlighted (no item with class bg-muted/50)
    const allItems = container.querySelectorAll(".bg-muted\\/50")
    expect(allItems.length).toBe(0)
  })

  it("missing orch ID shows sidebar without selection", () => {
    // No orchestration selected
    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: mockSelectPhase,
    })

    const { container } = render(
      <MemoryRouter>
        <Sidebar collapsed={false} />
      </MemoryRouter>
    )

    // Should render the sidebar
    expect(screen.getAllByText("Project Alpha").length).toBeGreaterThan(0)

    // But no item should be highlighted
    const allItems = container.querySelectorAll(".bg-muted\\/50")
    expect(allItems.length).toBe(0)
  })
})
