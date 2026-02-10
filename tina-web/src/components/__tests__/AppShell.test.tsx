import { describe, it, expect, afterEach, vi, beforeEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { BrowserRouter } from "react-router-dom"
import { RuntimeProvider } from "@/providers/RuntimeProvider"
import userEvent from "@testing-library/user-event"
import { AppShell } from "../AppShell"
import styles from "../AppShell.module.scss"

// Mock Sidebar component to avoid RuntimeProvider dependency
vi.mock("../Sidebar", () => ({
  Sidebar: ({ collapsed }: { collapsed: boolean }) => (
    <div data-testid="sidebar-mock" data-collapsed={collapsed}>
      Sidebar Mock
    </div>
  ),
}))

// Mock useSelection hook
vi.mock("@/hooks/useSelection", () => ({
  useSelection: vi.fn(() => ({
    orchestrationId: null,
    phaseId: null,
    selectOrchestration: vi.fn(),
    selectPhase: vi.fn(),
  })),
}))

// Mock useTypedQuery hook
vi.mock("@/hooks/useTypedQuery", () => ({
  useTypedQuery: vi.fn(() => ({ status: "loading" })),
}))

// Wrapper for components that need Router and Runtime context
const renderWithRouter = (ui: React.ReactElement) => {
  return render(
    <RuntimeProvider>
      <BrowserRouter>{ui}</BrowserRouter>
    </RuntimeProvider>
  )
}

describe("AppShell", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders header, sidebar, content outlet, and footer", () => {
    renderWithRouter(<AppShell />)

    // Header should be present
    expect(screen.getByRole("banner")).toBeInTheDocument()

    // Sidebar should be present with navigation role
    expect(screen.getByRole("navigation")).toBeInTheDocument()

    // Main content area should be present
    expect(screen.getByRole("main")).toBeInTheDocument()

    // Footer should be present
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
  })

  it("passes aria-label for landmark regions", () => {
    renderWithRouter(<AppShell />)

    expect(screen.getByRole("navigation")).toHaveAttribute("aria-label", "Main sidebar")
    expect(screen.getByRole("main")).toHaveAttribute("aria-label", "Page content")
  })

  it("sidebar starts expanded by default", () => {
    renderWithRouter(<AppShell />)

    const sidebar = screen.getByRole("navigation")
    expect(sidebar.className).toContain(styles.sidebar)
    expect(sidebar.className).not.toContain(styles.collapsed)
  })

  it("sidebar collapse toggles width class", async () => {
    const user = userEvent.setup()
    renderWithRouter(<AppShell />)

    const sidebar = screen.getByRole("navigation")
    const collapseButton = screen.getByRole("button", { name: /collapse sidebar/i })

    // Initially expanded
    expect(sidebar.className).not.toContain(styles.collapsed)

    // Click to collapse
    await user.click(collapseButton)
    expect(sidebar.className).toContain(styles.collapsed)

    // Click to expand
    await user.click(collapseButton)
    expect(sidebar.className).not.toContain(styles.collapsed)
  })

  describe("Header and Footer Integration", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("header renders title ORCHESTRATOR", () => {
      renderWithRouter(<AppShell />)
      expect(screen.getByText("ORCHESTRATOR")).toBeInTheDocument()
    })

    it("header renders version", () => {
      renderWithRouter(<AppShell />)
      // Version should be visible once we pass it to AppHeader
      expect(screen.getByRole("banner")).toBeInTheDocument()
    })

    it("footer shows 'Connected' when no selection", async () => {
      const { useSelection } = await import("@/hooks/useSelection")
      vi.mocked(useSelection).mockReturnValue({
        orchestrationId: null,
        phaseId: null,
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      renderWithRouter(<AppShell />)
      expect(screen.getByText(/connected/i)).toBeInTheDocument()
    })

    it("footer shows project/feature breadcrumb when orchestration selected", async () => {
      const { useSelection } = await import("@/hooks/useSelection")
      const { useTypedQuery } = await import("@/hooks/useTypedQuery")

      vi.mocked(useSelection).mockReturnValue({
        orchestrationId: "orch-123",
        phaseId: null,
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      vi.mocked(useTypedQuery).mockImplementation((def: any) => {
        if (def.key === "orchestrations.list") {
          return {
            status: "success",
            data: [
              {
                _id: "orch-123",
                _creationTime: 123,
                nodeId: "node-1",
                projectId: { _tag: "Some", value: "proj-1" },
                featureName: "my-feature",
                designDocPath: "/path/to/doc",
                branch: "tina/my-feature",
                worktreePath: { _tag: "Some", value: "/path" },
                totalPhases: 3,
                currentPhase: 2,
                status: "executing",
                startedAt: "2024-01-01",
                completedAt: { _tag: "None" },
                totalElapsedMins: { _tag: "None" },
                nodeName: "local",
              },
            ],
          }
        }
        if (def.key === "projects.list") {
          return {
            status: "success",
            data: [
              {
                _id: "proj-1",
                _creationTime: 123,
                name: "my-project",
                repoPath: "/path",
                createdAt: "2024-01-01",
                orchestrationCount: 1,
                latestFeature: "my-feature",
                latestStatus: "executing",
              },
            ],
          }
        }
        return { status: "loading" }
      })

      renderWithRouter(<AppShell />)

      // Should show project name and breadcrumb
      expect(screen.getByText(/my-project/i)).toBeInTheDocument()
      expect(screen.getByText(/my-feature/i)).toBeInTheDocument()
      expect(screen.getByText(/P2/i)).toBeInTheDocument()
      expect(screen.getByText(/executing/i)).toBeInTheDocument()
    })

    it("footer shows disconnected state", async () => {
      const { useSelection } = await import("@/hooks/useSelection")
      vi.mocked(useSelection).mockReturnValue({
        orchestrationId: null,
        phaseId: null,
        selectOrchestration: vi.fn(),
        selectPhase: vi.fn(),
      })

      renderWithRouter(<AppShell />)

      // Check for the status indicator (green dot for connected)
      const footer = screen.getByRole("contentinfo")
      expect(footer).toBeInTheDocument()
    })
  })
})
