import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { Sidebar } from "../Sidebar"
import { useServices } from "@/providers/RuntimeProvider"
import {
  buildOrchestrationSummary,
  buildProjectSummary,
  some,
} from "@/test/builders/domain"
import {
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { selectionState } from "@/test/harness/hooks"
import { installQueryStates } from "@/test/harness/query-runtime"
import { renderWithRuntime } from "@/test/harness/render"
import { assertRovingFocus } from "@/test/harness/roving"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useSelection")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection

const projects = [
  buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 2 }),
]

const orchestrations = [
  buildOrchestrationSummary({
    _id: "o1",
    featureName: "feature-one",
    projectId: some("p1"),
    status: "executing",
  }),
  buildOrchestrationSummary({
    _id: "o2",
    _creationTime: 1234567891,
    featureName: "feature-two",
    projectId: some("p1"),
    status: "complete",
    startedAt: "2024-01-02T10:00:00Z",
    completedAt: some("2024-01-02T11:00:00Z"),
    totalElapsedMins: some(60),
  }),
]

const mockSelectOrchestration = vi.fn()

const defaultQueryStates: QueryStateMap = {
  "projects.list": querySuccess(projects),
  "orchestrations.list": querySuccess(orchestrations),
}

function setQueryStates(overrides: Partial<QueryStateMap> = {}) {
  installQueryStates(mockUseTypedQuery, defaultQueryStates, overrides)
}

function renderSidebar(ui: ReactNode = <Sidebar />) {
  return renderWithRuntime(ui)
}

function SidebarHarness({
  onServices,
}: {
  onServices?: (services: ReturnType<typeof useServices>) => void
}) {
  const services = useServices()
  onServices?.(services)

  return (
    <>
      <Sidebar />
      <button onClick={() => services.focusService.moveItem(1)} data-testid="move-next" />
      <button
        onClick={() => {
          services.actionRegistry.get("sidebar.select")?.execute({})
        }}
        data-testid="execute-select-action"
      />
    </>
  )
}

describe("Sidebar Keyboard Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setQueryStates()
    mockUseSelection.mockReturnValue(
      selectionState({
        orchestrationId: null,
        phaseId: null,
        selectOrchestration: mockSelectOrchestration,
        selectPhase: vi.fn(),
      }),
    )
  })

  it("applies roving focus attributes and active descendant", () => {
    const { container } = renderSidebar()

    assertRovingFocus({
      container,
      listRole: "list",
      itemIds: ["sidebar-item-0", "sidebar-item-1"],
      activeId: "sidebar-item-0",
      focusedAttr: "data-focused",
    })
  })

  it("updates aria-activedescendant when active index changes", () => {
    const { container, getByTestId } = renderSidebar(<SidebarHarness />)

    const list = container.querySelector('[role="list"]')
    expect(list).toHaveAttribute("aria-activedescendant", "sidebar-item-0")

    act(() => {
      getByTestId("move-next").click()
    })

    expect(container.querySelector('[role="list"]')).toHaveAttribute(
      "aria-activedescendant",
      "sidebar-item-1",
    )
  })

  it("registers sidebar.select action for Enter key", async () => {
    let registry: ReturnType<typeof useServices>["actionRegistry"] | undefined
    renderSidebar(<SidebarHarness onServices={(services) => {
      registry = services.actionRegistry
    }} />)

    await waitFor(() => {
      const action = registry?.get("sidebar.select")
      expect(action).toBeDefined()
      expect(action?.label).toBe("Select Orchestration")
      expect(action?.key).toBe("Enter")
      expect(action?.when).toBe("sidebar.focused")
    })
  })

  it("Enter action calls selectOrchestration with correct ID", () => {
    const { getByTestId } = renderSidebar(<SidebarHarness />)

    act(() => {
      getByTestId("execute-select-action").click()
    })
    expect(mockSelectOrchestration).toHaveBeenCalledWith("o1")

    mockSelectOrchestration.mockClear()

    act(() => {
      getByTestId("move-next").click()
    })

    act(() => {
      getByTestId("execute-select-action").click()
    })

    expect(mockSelectOrchestration).toHaveBeenCalledWith("o2")
  })
})
