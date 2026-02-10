import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, renderHook, act } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { Option } from "effect"
import type { ReactNode } from "react"
import { Sidebar } from "../Sidebar"
import { RuntimeProvider, useServices } from "@/providers/RuntimeProvider"
import type { TypedQueryResult } from "@/hooks/useTypedQuery"
import type { ProjectSummary, OrchestrationSummary } from "@/schemas"

// Mock hooks
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useSelection")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery")
).useTypedQuery
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection")
).useSelection

describe("Sidebar Keyboard Navigation", () => {
  const mockSelectOrchestration = vi.fn()

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
      _id: "o1",
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
      _id: "o2",
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

    mockUseTypedQuery.mockImplementation((def) => {
      if (def.key === "projects.list") {
        return { status: "success", data: projects } as TypedQueryResult<ProjectSummary[]>
      }
      if (def.key === "orchestrations.list") {
        return { status: "success", data: orchestrations } as TypedQueryResult<OrchestrationSummary[]>
      }
      return { status: "loading" }
    })

    mockUseSelection.mockReturnValue({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: mockSelectOrchestration,
      selectPhase: vi.fn(),
    })
  })

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <RuntimeProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </RuntimeProvider>
    )
  }

  it("applies tabindex=0 to active item and tabindex=-1 to others", () => {
    const { container } = render(<Sidebar collapsed={false} />, { wrapper })

    // Get all orchestration items
    const items = container.querySelectorAll('[data-orchestration-id]')
    expect(items).toHaveLength(2)

    // First item should have tabindex=0 (active)
    expect(items[0]).toHaveAttribute("tabindex", "0")

    // Second item should have tabindex=-1
    expect(items[1]).toHaveAttribute("tabindex", "-1")
  })

  it("sets aria-activedescendant on list container", () => {
    const { container } = render(<Sidebar collapsed={false} />, { wrapper })

    const list = container.querySelector('[role="list"]')
    expect(list).toHaveAttribute("aria-activedescendant", "sidebar-item-0")
  })

  it("applies focus ring class to active item", () => {
    const { container } = render(<Sidebar collapsed={false} />, { wrapper })

    const items = container.querySelectorAll('[data-orchestration-id]')

    // First item should have focus ring
    expect(items[0]).toHaveClass("ring-2")
    expect(items[0]).toHaveClass("ring-primary")

    // Second item should not have focus ring
    expect(items[1]).not.toHaveClass("ring-2")
  })

  it("updates aria-activedescendant when active index changes", () => {
    // Use a single RuntimeProvider instance for both render and hook
    const TestComponent = () => {
      const services = useServices()
      return (
        <>
          <Sidebar collapsed={false} />
          <button
            onClick={() => services.focusService.moveItem(1)}
            data-testid="move-next"
          />
        </>
      )
    }

    const { container, getByTestId } = render(<TestComponent />, { wrapper })

    const list = container.querySelector('[role="list"]')
    expect(list).toHaveAttribute("aria-activedescendant", "sidebar-item-0")

    // Move to next item
    act(() => {
      getByTestId("move-next").click()
    })

    // Should update to second item
    const updatedList = container.querySelector('[role="list"]')
    expect(updatedList).toHaveAttribute("aria-activedescendant", "sidebar-item-1")
  })

  it("registers sidebar.select action for Enter key", () => {
    // Use a single RuntimeProvider instance
    const TestComponent = () => {
      const services = useServices()
      const action = services.actionRegistry.get("sidebar.select")

      return (
        <>
          <Sidebar collapsed={false} />
          <div data-testid="action-check">
            {action ? "registered" : "not-registered"}
          </div>
        </>
      )
    }

    const { getByTestId } = render(<TestComponent />, { wrapper })

    // Check that action is registered
    expect(getByTestId("action-check").textContent).toBe("registered")

    // Also verify the action details via a hook
    const { result } = renderHook(() => useServices(), { wrapper })
    const action = result.current.actionRegistry.get("sidebar.select")
    expect(action?.label).toBe("Select Orchestration")
    expect(action?.key).toBe("Enter")
    expect(action?.when).toBe("sidebar.focused")
  })

  it("Enter action calls selectOrchestration with correct ID", () => {
    // Use a single RuntimeProvider instance
    const TestComponent = () => {
      const services = useServices()

      return (
        <>
          <Sidebar collapsed={false} />
          <button
            onClick={() => {
              const action = services.actionRegistry.get("sidebar.select")
              action?.execute({})
            }}
            data-testid="execute-action"
          />
          <button
            onClick={() => services.focusService.moveItem(1)}
            data-testid="move-next"
          />
        </>
      )
    }

    const { getByTestId } = render(<TestComponent />, { wrapper })

    // Execute the action (should select first orchestration)
    act(() => {
      getByTestId("execute-action").click()
    })
    expect(mockSelectOrchestration).toHaveBeenCalledWith("o1")

    vi.clearAllMocks()

    // Move to second item
    act(() => {
      getByTestId("move-next").click()
    })

    // Execute again (should select second orchestration)
    act(() => {
      getByTestId("execute-action").click()
    })
    expect(mockSelectOrchestration).toHaveBeenCalledWith("o2")
  })
})
