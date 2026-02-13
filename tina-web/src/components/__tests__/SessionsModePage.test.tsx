import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import { SessionsModePage } from "../modes/SessionsModePage"
import { queryLoading, querySuccess, type QueryStateMap } from "@/test/builders/query"
import { renderWithAppRuntime } from "@/test/harness/app-runtime"
import type { TerminalTarget } from "@/schemas"

vi.mock("@/hooks/useTypedQuery")
vi.mock("@/components/TerminalView", () => ({
  TerminalView: (props: { paneId: string; label: string }) => (
    <div data-testid="terminal-view">
      TerminalView:{props.paneId}:{props.label}
    </div>
  ),
}))

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

function buildTarget(overrides: Partial<TerminalTarget> = {}): TerminalTarget {
  return {
    id: "t1",
    label: "worker-1",
    tmuxSessionName: "session-1",
    tmuxPaneId: "%1",
    type: "agent",
    cli: "claude",
    ...overrides,
  }
}

const defaultStates: Partial<QueryStateMap> = {
  "terminalTargets.list": querySuccess([buildTarget()]),
}

function renderPage({
  route = "/sessions",
  states = {},
}: {
  route?: string
  states?: Partial<QueryStateMap>
} = {}) {
  return renderWithAppRuntime(<SessionsModePage />, {
    route,
    mockUseTypedQuery,
    states: { ...defaultStates, ...states },
  })
}

describe("SessionsModePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders loading state while query is pending", () => {
    renderPage({
      states: {
        "terminalTargets.list": queryLoading(),
      },
    })

    expect(screen.getByText("Loading sessions...")).toBeInTheDocument()
  })

  it("renders empty state when no sessions exist", () => {
    renderPage({
      states: {
        "terminalTargets.list": querySuccess([]),
      },
    })

    expect(
      screen.getByText(/no active sessions/i),
    ).toBeInTheDocument()
  })

  it("renders select-a-session prompt when sessions exist but none selected", () => {
    renderPage()

    expect(
      screen.getByText(/select a session from the sidebar/i),
    ).toBeInTheDocument()
  })

  it("renders TerminalView when pane search param matches a target", () => {
    renderPage({
      route: "/sessions?pane=%1",
    })

    expect(screen.getByTestId("terminal-view")).toBeInTheDocument()
    expect(screen.getByText(/TerminalView:%1:worker-1/)).toBeInTheDocument()
  })

  it("renders not-found when pane search param does not match any target", () => {
    renderPage({
      route: "/sessions?pane=unknown-pane",
    })

    expect(screen.getByText("Session not found")).toBeInTheDocument()
    expect(
      screen.getByText(/terminal pane unknown-pane is no longer available/i),
    ).toBeInTheDocument()
  })
})
