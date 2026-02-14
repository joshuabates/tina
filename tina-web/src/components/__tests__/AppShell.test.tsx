import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import { Route, Routes } from "react-router-dom"
import { AppShell } from "../AppShell"
import {
  buildOrchestrationSummary,
  buildProjectSummary,
  some,
} from "@/test/builders/domain"
import { queryLoading, querySuccess, type QueryStateMap } from "@/test/builders/query"
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
  "projects.list": querySuccess([
    buildProjectSummary({
      _id: "p1",
      name: "Project Alpha",
      orchestrationCount: 1,
    }),
  ]),
}

function renderShell(
  route = "/projects/p1/observe",
  states: Partial<QueryStateMap> = defaultStates,
) {
  return renderWithAppRuntime(
    <Routes>
      <Route path="/projects/:projectId/observe" element={<AppShell />} />
    </Routes>,
    {
      route,
      states,
      mockUseTypedQuery,
    },
  )
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders mode rail, sidebar, content outlet, and footer", () => {
    renderShell()

    expect(screen.getByRole("navigation", { name: /mode rail/i })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: /observe sidebar/i })).toBeInTheDocument()
    expect(screen.getByRole("main")).toBeInTheDocument()
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
  })

  it("renders project picker in the shared shell header", () => {
    renderShell()

    const header = screen.getByRole("banner", { name: /workspace header/i })
    expect(within(header).getByTestId("project-picker")).toBeInTheDocument()
  })

  it("uses semantic main element without redundant role attribute", () => {
    renderShell()

    const main = screen.getByRole("main")
    expect(main).toHaveAttribute("aria-label", "Page content")
    expect(main.tagName).toBe("MAIN")
    expect(main).not.toHaveAttribute("role")
  })

  it("footer shows 'Connected' when no orchestration is selected", () => {
    renderShell()
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
  })

  it("footer shows project/feature breadcrumb when orchestration selected", () => {
    renderShell("/projects/p1/observe?orch=orch-123", {
      ...defaultStates,
      "orchestrations.list": querySuccess([
        buildOrchestrationSummary({
          _id: "orch-123",
          _creationTime: 123,
          nodeId: "node-1",
          projectId: some("p1"),
          featureName: "my-feature",
          specDocPath: "/path/to/doc",
          branch: "tina/my-feature",
          currentPhase: 2,
          status: "executing",
          startedAt: "2024-01-01",
        }),
      ]),
      "projects.list": querySuccess([
        buildProjectSummary({
          _id: "p1",
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

    const statusRegion = screen.getByRole("contentinfo")
    expect(statusRegion).toHaveTextContent(/my-project/i)
    expect(statusRegion).toHaveTextContent(/my-feature/i)
    expect(statusRegion).toHaveTextContent(/P2/i)
    expectContainerToContainStatusLabel(statusRegion, "executing")
  })
})
