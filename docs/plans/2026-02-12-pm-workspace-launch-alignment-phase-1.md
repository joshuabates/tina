# PM Workspace + Launch UX Realignment Phase 1: Navigation and Workspace Shell

> **For Claude:** Use tina:executing-plans to implement this plan.

**Plan Baseline:** ef94a22b8185482b0e6cfa73f299346839435d83

**Goal:** Remove PM-specific sidebar model and sublinks, route project click to project-scoped PM workspace, introduce unified PM table shell with `Tickets | Designs` segmented toggle.

**Architecture:** The current PM system has a separate `PmShell` with its own sidebar (`PmSidebar`) that duplicates navigation for each project (showing Tickets/Designs/Launch sub-links). The global sidebar in `Sidebar.tsx` already groups orchestrations by project. The design requires:

1. **Sidebar changes:** When a project is clicked in the global sidebar, navigate to `/pm?project=<id>` instead of expanding the group. Keep the global sidebar visible on PM routes (remove `noSidebar` conditional).
2. **PmShell rewrite:** Remove the PM-specific sidebar entirely. Replace with a flat workspace shell that shows a project header and a `Tickets | Designs` segmented control toggle. The toggle switches table content inline (no route change).
3. **Route collapse:** Collapse `/pm/tickets` and `/pm/designs` into just `/pm?project=<id>` with tab state managed via local component state (not URL). Keep `/pm/designs/:designId` and `/pm/tickets/:ticketId` detail routes temporarily.

**Key files:**
- `tina-web/src/App.tsx` — Route definitions
- `tina-web/src/components/AppShell.tsx` — Layout shell, sidebar visibility
- `tina-web/src/components/Sidebar.tsx` — Global sidebar, project click behavior
- `tina-web/src/components/pm/PmShell.tsx` — PM shell with sidebar (to be rewritten)
- `tina-web/src/components/pm/PmShell.module.scss` — PM shell styles
- `tina-web/src/components/__tests__/PmRoutes.test.tsx` — Route tests
- `tina-web/src/components/__tests__/PmShell.test.tsx` — Shell tests

### Complexity Budget

| Metric | Limit |
|--------|-------|
| Max lines per file | 400 |
| Max function length | 50 lines |
| Max total implementation lines | 500 |

---

## Tasks

### Task 1: Update PmShell tests to specify new workspace behavior

**Files:**
- `tina-web/src/components/__tests__/PmShell.test.tsx`

**Model:** opus

**review:** full

**Depends on:** none

Write failing tests for the new PmShell behavior before modifying implementation:

**Steps:**

1. Replace the existing PmShell test file with tests for the new unified workspace:

```tsx
// tina-web/src/components/__tests__/PmShell.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  some,
} from "@/test/builders/domain"
import {
  queryLoading,
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"

vi.mock("@/hooks/useTypedQuery")
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const projects = [
  buildProjectSummary({ _id: "p1", name: "Project Alpha", orchestrationCount: 0 }),
  buildProjectSummary({ _id: "p2", name: "Project Beta", orchestrationCount: 0 }),
]

const defaultStates: Partial<QueryStateMap> = {
  "projects.list": querySuccess(projects),
  "orchestrations.list": querySuccess([
    buildOrchestrationSummary({
      _id: "orch1",
      projectId: some("p1"),
      featureName: "test-feature",
      status: "executing",
    }),
  ]),
  "tickets.list": querySuccess([]),
  "designs.list": querySuccess([]),
}

function renderApp(route: string, states: Partial<QueryStateMap> = defaultStates) {
  return renderWithAppRuntime(<App />, {
    route,
    mockUseTypedQuery,
    states,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PmShell - unified workspace", () => {
  it("does not render a PM-specific sidebar", () => {
    renderApp("/pm?project=p1")

    // The old PM sidebar should be gone
    expect(
      screen.queryByRole("navigation", { name: /project navigation/i }),
    ).not.toBeInTheDocument()
  })

  it("renders a segmented control with Tickets and Designs tabs", () => {
    renderApp("/pm?project=p1")

    const shell = screen.getByTestId("pm-shell")
    expect(within(shell).getByRole("tab", { name: /tickets/i })).toBeInTheDocument()
    expect(within(shell).getByRole("tab", { name: /designs/i })).toBeInTheDocument()
  })

  it("shows Tickets tab as active by default", () => {
    renderApp("/pm?project=p1")

    const ticketsTab = screen.getByRole("tab", { name: /tickets/i })
    expect(ticketsTab).toHaveAttribute("aria-selected", "true")
  })

  it("switches to Designs content when Designs tab is clicked", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    const designsTab = screen.getByRole("tab", { name: /designs/i })
    await user.click(designsTab)

    expect(designsTab).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: /tickets/i })).toHaveAttribute("aria-selected", "false")
  })

  it("renders ticket list content when Tickets tab is active", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })

  it("renders design list content when Designs tab is active", async () => {
    const user = userEvent.setup()
    renderApp("/pm?project=p1")

    await user.click(screen.getByRole("tab", { name: /designs/i }))
    expect(screen.getByTestId("design-list-page")).toBeInTheDocument()
  })

  it("shows project name in workspace header", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByText("Project Alpha")).toBeInTheDocument()
  })

  it("shows 'select a project' when no project param", () => {
    renderApp("/pm")

    expect(screen.getByText(/select a project/i)).toBeInTheDocument()
  })
})
```

2. Run tests to confirm they fail:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/PmShell.test.tsx 2>&1 | tail -20`

Expected: Tests should fail (old behavior doesn't match new assertions).

---

### Task 2: Update PmRoutes tests for new routing structure

**Files:**
- `tina-web/src/components/__tests__/PmRoutes.test.tsx`

**Model:** opus

**review:** spec-only

**Depends on:** none

Update the routing tests to reflect the collapsed route structure:

**Steps:**

1. Update PmRoutes tests:

```tsx
// tina-web/src/components/__tests__/PmRoutes.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import App from "../../App"
import {
  buildProjectSummary,
  buildOrchestrationSummary,
  some,
} from "@/test/builders/domain"
import {
  querySuccess,
  type QueryStateMap,
} from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"

vi.mock("@/hooks/useTypedQuery")
vi.mock("convex/react", async (importOriginal) => {
  const mod = await importOriginal<typeof import("convex/react")>()
  return {
    ...mod,
    useMutation: vi.fn(() => vi.fn()),
  }
})

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const defaultStates: Partial<QueryStateMap> = {
  "projects.list": querySuccess([
    buildProjectSummary({ _id: "p1", orchestrationCount: 1 }),
  ]),
  "orchestrations.list": querySuccess([
    buildOrchestrationSummary({
      _id: "orch1",
      projectId: some("p1"),
      featureName: "test-feature",
      status: "executing",
    }),
  ]),
  "tickets.list": querySuccess([]),
  "designs.list": querySuccess([]),
}

function renderApp(route: string, states: Partial<QueryStateMap> = defaultStates) {
  return renderWithAppRuntime(<App />, {
    route,
    mockUseTypedQuery,
    states,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PM routes", () => {
  it("renders PmShell when navigating to /pm", () => {
    renderApp("/pm")

    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
  })

  it("renders DesignDetailPage when navigating to /pm/designs/:designId", () => {
    renderApp("/pm/designs/design-123")

    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
    expect(screen.getByTestId("design-detail-page")).toBeInTheDocument()
  })

  it("renders TicketDetailPage when navigating to /pm/tickets/:ticketId", () => {
    renderApp("/pm/tickets/ticket-456")

    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
    expect(screen.getByTestId("ticket-detail-page")).toBeInTheDocument()
  })

  it("PmShell is nested inside AppShell", () => {
    renderApp("/pm")

    expect(screen.getByRole("banner")).toBeInTheDocument()
    expect(screen.getByRole("main")).toBeInTheDocument()
    expect(screen.getByTestId("pm-shell")).toBeInTheDocument()
  })

  it("global sidebar remains visible on PM routes", () => {
    renderApp("/pm?project=p1")

    expect(
      screen.getByRole("navigation", { name: /main sidebar/i }),
    ).toBeInTheDocument()
  })

  it("/pm index renders ticket list content by default", () => {
    renderApp("/pm?project=p1")

    expect(screen.getByTestId("ticket-list-page")).toBeInTheDocument()
  })
})
```

2. Run tests to confirm current failures:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/PmRoutes.test.tsx 2>&1 | tail -20`

Expected: Some tests fail (e.g., global sidebar visibility on PM routes).

---

### Task 3: Update AppShell to keep global sidebar visible on PM routes

**Files:**
- `tina-web/src/components/AppShell.tsx`
- `tina-web/src/components/AppShell.module.scss`

**Model:** haiku

**review:** spec-only

**Depends on:** none

Remove the `isPmRoute` conditional that hides the global sidebar on PM routes.

**Steps:**

1. In `AppShell.tsx`, remove the `isPmRoute` variable and the conditional sidebar hiding:

Remove lines related to `isPmRoute`:
- Delete `const isPmRoute = location.pathname === "/pm" || location.pathname.startsWith("/pm/")`
- Change `<div className={\`${styles.appShell}${isPmRoute ? \` ${styles.noSidebar}\` : ""}\`}>` to `<div className={styles.appShell}>`
- Remove the `{!isPmRoute && (` conditional wrapper around the sidebar div — always render it
- Remove the `useLocation` import if no longer used

The resulting AppShell should always show the sidebar regardless of route.

2. In `AppShell.module.scss`, remove the `.noSidebar` class (lines 16-22) since it's no longer needed.

3. Verify:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/PmRoutes.test.tsx 2>&1 | tail -20`

Expected: The "global sidebar remains visible on PM routes" test passes.

---

### Task 4: Update Sidebar to navigate to /pm?project=<id> on project click

**Files:**
- `tina-web/src/components/Sidebar.tsx`

**Model:** opus

**review:** full

**Depends on:** 3

Change project click behavior in the global sidebar to navigate to `/pm?project=<id>` instead of selecting the first orchestration.

**Steps:**

1. Add `useNavigate` import from `react-router-dom` at the top of the file.

2. In `SidebarContent`, add `const navigate = useNavigate()` near the other hooks.

3. In the project initialization loop (around line 119-151), change the `onClick` assignment for each project. Currently projects don't have a direct click handler — they get `project.onClick = project.items[0]?.onClick` at line 191. Change this to navigate to PM:

Replace the block at lines 189-192:
```tsx
    for (const project of result) {
      project.active = project.items.some((item) => item.active === true)
      project.onClick = project.items[0]?.onClick
    }
```

With:
```tsx
    for (const project of result) {
      project.active = project.items.some((item) => item.active === true)
      project.onClick = () => navigate(`/pm?project=${project.id}`)
    }
```

4. Verify no other changes needed — the `SidebarNav` component already renders `project.onClick` on the project row.

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/ 2>&1 | tail -30`

Expected: Sidebar click behavior updated. Tests related to project navigation should pass.

---

### Task 5: Rewrite PmShell as unified workspace with segmented control

**Files:**
- `tina-web/src/components/pm/PmShell.tsx`
- `tina-web/src/components/pm/PmShell.module.scss`

**Model:** opus

**review:** full

**Depends on:** 3, 4

Replace the PM shell's sidebar-based layout with a flat workspace shell containing a project header and Tickets/Designs segmented control.

**Steps:**

1. Rewrite `PmShell.tsx`:

```tsx
import { useState } from "react"
import { Outlet, useSearchParams, useLocation } from "react-router-dom"
import { useTypedQuery } from "@/hooks/useTypedQuery"
import { ProjectListQuery } from "@/services/data/queryDefs"
import { DataErrorBoundary } from "../DataErrorBoundary"
import { isAnyQueryLoading, firstQueryError } from "@/lib/query-state"
import { TicketListPage } from "./TicketListPage"
import { DesignListPage } from "./DesignListPage"
import type { ProjectSummary } from "@/schemas"
import styles from "./PmShell.module.scss"

type TabMode = "tickets" | "designs"

function WorkspaceContent({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [activeTab, setActiveTab] = useState<TabMode>("tickets")

  return (
    <>
      <div className={styles.workspaceHeader}>
        <h2 className={styles.projectTitle}>{projectName}</h2>
        <div className={styles.segmentedControl} role="tablist" aria-label="PM workspace tabs">
          <button
            role="tab"
            aria-selected={activeTab === "tickets"}
            className={`${styles.segment}${activeTab === "tickets" ? ` ${styles.segmentActive}` : ""}`}
            onClick={() => setActiveTab("tickets")}
          >
            Tickets
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "designs"}
            className={`${styles.segment}${activeTab === "designs" ? ` ${styles.segmentActive}` : ""}`}
            onClick={() => setActiveTab("designs")}
          >
            Designs
          </button>
        </div>
      </div>
      <div role="tabpanel">
        {activeTab === "tickets" ? <TicketListPage /> : <DesignListPage />}
      </div>
    </>
  )
}

function PmWorkspace() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const projectId = searchParams.get("project")

  const projectsResult = useTypedQuery(ProjectListQuery, {})

  // Detail routes render via Outlet
  const isDetailRoute =
    location.pathname.startsWith("/pm/designs/") ||
    location.pathname.startsWith("/pm/tickets/")

  if (isDetailRoute) {
    return <Outlet />
  }

  if (!projectId) {
    return (
      <div className={styles.noProject}>Select a project from the sidebar</div>
    )
  }

  if (isAnyQueryLoading(projectsResult)) {
    return (
      <div className={styles.loading}>
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonBar} />
      </div>
    )
  }

  const queryError = firstQueryError(projectsResult)
  if (queryError) {
    throw queryError
  }

  if (projectsResult.status !== "success") {
    return null
  }

  const project = projectsResult.data.find((p: ProjectSummary) => p._id === projectId)
  const projectName = project?.name ?? "Unknown Project"

  return <WorkspaceContent projectId={projectId} projectName={projectName} />
}

export function PmShell() {
  return (
    <div data-testid="pm-shell" className={styles.pmShell}>
      <DataErrorBoundary panelName="pm-workspace">
        <PmWorkspace />
      </DataErrorBoundary>
    </div>
  )
}
```

2. Rewrite `PmShell.module.scss`:

```scss
@use '../../styles/tokens' as *;

.pmShell {
  height: 100%;
  overflow: auto;
}

.workspaceHeader {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid $border-color;
}

.projectTitle {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  margin: 0;
}

.segmentedControl {
  display: inline-flex;
  border: 1px solid $border-color;
  border-radius: 6px;
  overflow: hidden;
}

.segment {
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 500;
  color: $text-muted;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    color: $text-primary;
    background: hsl(var(--accent) / 0.06);
  }

  & + & {
    border-left: 1px solid $border-color;
  }
}

.segmentActive {
  color: $text-primary;
  background: hsl(var(--accent) / 0.12);
  font-weight: 600;
}

.noProject {
  padding: 32px;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}

.loading {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeletonBar {
  height: 28px;
  width: 100%;
  background: hsl(var(--border));
  border-radius: 4px;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
```

3. Verify PmShell tests pass:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/PmShell.test.tsx 2>&1 | tail -20`

Expected: All PmShell tests pass.

---

### Task 6: Update App.tsx route definitions

**Files:**
- `tina-web/src/App.tsx`

**Model:** haiku

**review:** spec-only

**Depends on:** 5

Collapse PM sub-routes. Remove the standalone `/pm/tickets` and `/pm/designs` list routes since they are now handled by the segmented control in PmShell. Keep detail routes.

**Steps:**

1. Update `App.tsx`:

```tsx
import { Route, Routes } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { OrchestrationPage } from "./components/OrchestrationPage"
import { PmShell } from "./components/pm/PmShell"
import { DesignDetailPage } from "./components/pm/DesignDetailPage"
import { TicketDetailPage } from "./components/pm/TicketDetailPage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OrchestrationPage />} />
        <Route path="pm" element={<PmShell />}>
          <Route path="designs/:designId" element={<DesignDetailPage />} />
          <Route path="tickets/:ticketId" element={<TicketDetailPage />} />
        </Route>
        <Route path="*" element={<OrchestrationPage />} />
      </Route>
    </Routes>
  )
}
```

Note: Remove imports for `DesignListPage`, `TicketListPage`, and `LaunchOrchestrationPage` from `App.tsx` — they are no longer routed directly. `TicketListPage` and `DesignListPage` are now rendered by `PmShell` internally via the segmented control.

2. Run all PM tests:

Run: `cd /Users/joshua/Projects/tina && npx vitest run tina-web/src/components/__tests__/PmRoutes.test.tsx tina-web/src/components/__tests__/PmShell.test.tsx 2>&1 | tail -30`

Expected: All PM route and shell tests pass.

---

### Task 7: Run full test suite and fix any regressions

**Files:**
- (any files needing fixes)

**Model:** opus

**review:** full

**Depends on:** 1, 2, 3, 4, 5, 6

Run the full tina-web test suite. Fix any regressions from the navigation and workspace changes.

**Steps:**

1. Run full web test suite:

Run: `cd /Users/joshua/Projects/tina && npx vitest run --reporter=verbose 2>&1 | tail -50`

Expected: All tests pass. If any fail, investigate and fix. Common regressions to watch for:
- Other tests that navigate to `/pm/tickets` or `/pm/designs` list routes directly
- Tests that expect the PM sidebar navigation
- Tests that check for `noSidebar` class on AppShell

2. Run TypeScript type check:

Run: `cd /Users/joshua/Projects/tina && npx tsc --noEmit --project tina-web/tsconfig.json 2>&1 | tail -20`

Expected: No type errors.

---

## Phase Estimates

| Task | Description | Estimate |
|------|-------------|----------|
| 1 | Write failing PmShell tests | 5 min |
| 2 | Write failing PmRoutes tests | 3 min |
| 3 | Remove sidebar hiding from AppShell | 3 min |
| 4 | Update Sidebar project click to navigate | 4 min |
| 5 | Rewrite PmShell with segmented control | 8 min |
| 6 | Update App.tsx routes | 3 min |
| 7 | Full test suite + fix regressions | 5 min |
| **Total** | | **~31 min** |

## Lint Report

| Rule | Status |
|------|--------|
| model-tag | pass |
| review-tag | pass |
| depends-on | pass |
| plan-baseline | pass |
| complexity-budget | pass |
| phase-estimates | pass |
| file-list | pass |
| run-command | pass |
| expected-output | pass |

**Result:** pass
