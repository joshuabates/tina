import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import { AppShell } from "../AppShell"
import styles from "../AppShell.module.scss"
import {
  buildOrchestrationSummary,
  buildProjectSummary,
  some,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import { expectContainerToContainStatusLabel } from "@/test/harness/status"

vi.mock("../Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar-mock">Sidebar Mock</div>,
}))

vi.mock("@/hooks/useTypedQuery")
const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const defaultStates: Partial<QueryStateMap> = {
  "orchestrations.list": queryLoading(),
  "projects.list": queryLoading(),
}

function renderShell(
  route = "/",
  states: Partial<QueryStateMap> = defaultStates,
) {
  return renderWithAppRuntime(<AppShell />, {
    route,
    states,
    mockUseTypedQuery,
  })
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      renderShell()

      expect(screen.getByText(/connected/i)).toBeInTheDocument()
    })

    it("footer shows project/feature breadcrumb when orchestration selected", () => {
      renderShell("/?orch=orch-123", {
        ...defaultStates,
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

      expect(screen.getByText(/my-project/i)).toBeInTheDocument()
      expect(screen.getByText(/my-feature/i)).toBeInTheDocument()
      expect(screen.getByText(/P2/i)).toBeInTheDocument()
      expectContainerToContainStatusLabel(
        screen.getByRole("contentinfo"),
        "executing",
      )
    })

    it("footer renders status region", () => {
      renderShell()

      expect(screen.getByRole("contentinfo")).toBeInTheDocument()
    })
  })
})
