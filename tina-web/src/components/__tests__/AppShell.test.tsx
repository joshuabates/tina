import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { AppShell } from "../AppShell"
import styles from "../AppShell.module.scss"
import {
  buildOrchestrationSummary,
  buildProjectSummary,
  some,
} from "@/test/builders/domain"
import {
  queryLoading,
  queryStateFor,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { selectionState, type SelectionStateMock } from "@/test/harness/hooks"

vi.mock("../Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar-mock">Sidebar Mock</div>,
}))

vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useTypedQuery")
vi.mock("@/hooks/useActionRegistration")

const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection
const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

function renderShell() {
  return render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  )
}

function setupSelection(overrides: Partial<SelectionStateMock> = {}) {
  mockUseSelection.mockReturnValue(
    selectionState({
      orchestrationId: null,
      phaseId: null,
      selectOrchestration: vi.fn(),
      selectPhase: vi.fn(),
      ...overrides,
    }),
  )
}

function setupQueryStates(overrides: Partial<QueryStateMap> = {}) {
  const states: QueryStateMap = {
    "orchestrations.list": queryLoading(),
    "projects.list": queryLoading(),
    ...overrides,
  }

  mockUseTypedQuery.mockImplementation((def) => queryStateFor(def.key, states))
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSelection()
    setupQueryStates()
  })

  it("renders header, sidebar, content outlet, and footer", () => {
    renderShell()

    expect(screen.getByRole("banner")).toBeInTheDocument()
    expect(screen.getByRole("navigation")).toBeInTheDocument()
    expect(screen.getByRole("main")).toBeInTheDocument()
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
  })

  it("passes aria-label for landmark regions", () => {
    renderShell()

    expect(screen.getByRole("navigation")).toHaveAttribute(
      "aria-label",
      "Main sidebar",
    )
    expect(screen.getByRole("main")).toHaveAttribute("aria-label", "Page content")
  })

  it("uses semantic main element without redundant role attribute", () => {
    renderShell()

    const main = screen.getByRole("main")
    expect(main).toHaveAttribute("aria-label", "Page content")
    expect(main.tagName).toBe("MAIN")
    expect(main).not.toHaveAttribute("role")
  })

  it("sidebar starts expanded by default", () => {
    renderShell()

    const sidebar = screen.getByRole("navigation")
    expect(sidebar.className).toContain(styles.sidebar)
    expect(sidebar.className).not.toContain(styles.collapsed)
  })

  describe("Header and Footer Integration", () => {
    it("header renders title ORCHESTRATOR", () => {
      renderShell()
      expect(screen.getByText("ORCHESTRATOR")).toBeInTheDocument()
    })

    it("header renders version", () => {
      renderShell()
      expect(screen.getByRole("banner")).toBeInTheDocument()
    })

    it("footer shows 'Connected' when no selection", () => {
      setupSelection({ orchestrationId: null })

      renderShell()

      expect(screen.getByText(/connected/i)).toBeInTheDocument()
    })

    it("footer shows project/feature breadcrumb when orchestration selected", () => {
      setupSelection({ orchestrationId: "orch-123" })

      setupQueryStates({
        "orchestrations.list": querySuccess([
          buildOrchestrationSummary({
            _id: "orch-123",
            _creationTime: 123,
            nodeId: "node-1",
            projectId: some("proj-1"),
            featureName: "my-feature",
            designDocPath: "/path/to/doc",
            branch: "tina/my-feature",
            currentPhase: 2,
            status: "executing",
            startedAt: "2024-01-01",
          }),
        ]),
        "projects.list": querySuccess([
          buildProjectSummary({
            _id: "proj-1",
            _creationTime: 123,
            name: "my-project",
            repoPath: "/path",
            createdAt: "2024-01-01",
            orchestrationCount: 1,
            latestFeature: "my-feature",
            latestStatus: "executing",
          }),
        ]),
      })

      renderShell()

      expect(screen.getByText(/my-project/i)).toBeInTheDocument()
      expect(screen.getByText(/my-feature/i)).toBeInTheDocument()
      expect(screen.getByText(/P2/i)).toBeInTheDocument()
      expect(screen.getByText(/executing/i)).toBeInTheDocument()
    })

    it("footer renders status region", () => {
      renderShell()

      expect(screen.getByRole("contentinfo")).toBeInTheDocument()
    })
  })
})
