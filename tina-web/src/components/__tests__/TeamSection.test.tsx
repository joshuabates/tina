import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { Option } from "effect"
import { TeamSection } from "../TeamSection"
import type { OrchestrationDetail } from "@/schemas"
import {
  buildOrchestrationDetail,
  buildPhase,
  buildTeamMember,
} from "@/test/builders/domain"
import { setPanelFocus, setPanelSelection } from "@/test/harness/panel-state"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess } from "@/test/builders/query"

vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")
vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

const mockUseFocusable = vi.mocked(
  await import("@/hooks/useFocusable"),
).useFocusable
const mockUseSelection = vi.mocked(
  await import("@/hooks/useSelection"),
).useSelection

function setSelection(phaseId: string | null = null) {
  setPanelSelection(mockUseSelection, { phaseId })
}

function buildDetail(overrides: Partial<OrchestrationDetail> = {}): OrchestrationDetail {
  return buildOrchestrationDetail({
    _id: "orch1",
    currentPhase: 1,
    phases: [buildPhase({ _id: "phase1", orchestrationId: "orch1", phaseNumber: "1" })],
    teamMembers: [
      buildTeamMember({
        _id: "member0",
        orchestrationId: "orch1",
        phaseNumber: "0",
        agentName: "orchestrator",
      }),
      buildTeamMember({ _id: "member1", orchestrationId: "orch1", phaseNumber: "1", agentName: "worker1" }),
      buildTeamMember({
        _id: "member2",
        _creationTime: 1234567891,
        orchestrationId: "orch1",
        phaseNumber: "1",
        agentName: "worker2",
      }),
    ],
    ...overrides,
  })
}

describe("TeamSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setPanelFocus(mockUseFocusable)
    setSelection()
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "events.list": querySuccess([]),
      },
    })
  })

  it("renders orchestration-scope members when no phase is selected", () => {
    render(<TeamSection detail={buildDetail()} />)

    expect(screen.getByText("orchestrator")).toBeInTheDocument()
    expect(screen.queryByText("worker1")).not.toBeInTheDocument()
    expect(screen.queryByText("worker2")).not.toBeInTheDocument()
  })

  it("separates orchestration and phase members without duplication", () => {
    setSelection("phase1")
    render(<TeamSection detail={buildDetail()} />)

    expect(screen.getByText("orchestrator")).toBeInTheDocument()
    expect(screen.getByText("worker1")).toBeInTheDocument()
    expect(screen.getByText("worker2")).toBeInTheDocument()
    expect(screen.getAllByText("worker1")).toHaveLength(1)
    expect(screen.getAllByText("worker2")).toHaveLength(1)
  })

  it("handles empty team members array", () => {
    const { container } = render(<TeamSection detail={buildDetail({ teamMembers: [] })} />)

    expect(container).toBeInTheDocument()
    expect(screen.getByText(/no team members/i)).toBeInTheDocument()
    expect(screen.getByText(/no phase selected/i)).toBeInTheDocument()
  })

  it.each([
    { currentPhase: 1, memberPhase: "1", expected: "ACTIVE" },
    { currentPhase: 2, memberPhase: "1", expected: "IDLE" },
  ])(
    "maps member status to $expected for currentPhase=$currentPhase memberPhase=$memberPhase",
    ({ currentPhase, memberPhase, expected }) => {
      setSelection("phase1")
      render(
        <TeamSection
          detail={buildDetail({
            currentPhase,
            teamMembers: [
              buildTeamMember({
                _id: "member1",
                orchestrationId: "orch1",
                phaseNumber: memberPhase,
                agentName: "worker1",
              }),
            ],
          })}
        />,
      )

      expect(screen.getByText(expected)).toBeInTheDocument()
    },
  )

  it("registers rightPanel.team focus section", () => {
    render(<TeamSection detail={buildDetail()} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.team", expect.any(Number))
  })

  it("updates item count when team members change", () => {
    const detail = buildDetail()
    const { rerender } = render(<TeamSection detail={detail} />)

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.team", 1)

    rerender(
      <TeamSection
        detail={buildDetail({
          teamMembers: [
            ...detail.teamMembers,
            buildTeamMember({
              _id: "member3",
              _creationTime: 1234567892,
              orchestrationId: "orch1",
              phaseNumber: "0",
              agentName: "orchestrator-2",
            }),
          ],
        })}
      />,
    )

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.team", 2)
  })

  describe("shutdown tracking", () => {
    it("hides agents when shutdown event exists", () => {
      setSelection("phase1")
      const shutdownEvents = [
        {
          _id: "event1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: Option.some("1"),
          eventType: "agent_shutdown",
          source: "tina-daemon",
          summary: "worker1 shutdown",
          detail: Option.some(JSON.stringify({
            agent_name: "worker1",
            agent_type: "tina:phase-executor",
            shutdown_detected_at: "2026-02-10T10:00:00Z",
          })),
          recordedAt: "2026-02-10T10:00:05Z",
        },
      ]

      installAppRuntimeQueryMock(mockUseTypedQuery, {
        states: {
          "events.list": querySuccess(shutdownEvents),
        },
      })

      render(<TeamSection detail={buildDetail()} />)

      // Verify worker1 is removed from the list
      expect(screen.queryByText("worker1")).not.toBeInTheDocument()

      // Verify worker2 remains visible and active
      expect(screen.getByText("worker2")).toBeInTheDocument()
      expect(screen.getByText("ACTIVE")).toBeInTheDocument()
      expect(screen.queryByText("SHUTDOWN")).not.toBeInTheDocument()
    })

    it("keeps active agents visible when no shutdown events exist", () => {
      setSelection("phase1")
      installAppRuntimeQueryMock(mockUseTypedQuery, {
        states: {
          "events.list": querySuccess([]),
        },
      })

      render(<TeamSection detail={buildDetail()} />)

      // Verify no shutdown status displayed
      expect(screen.queryByText("SHUTDOWN")).not.toBeInTheDocument()

      // Verify both members are visible
      expect(screen.getByText("worker1")).toBeInTheDocument()
      expect(screen.getByText("worker2")).toBeInTheDocument()
    })

    it("handles invalid shutdown event JSON gracefully", () => {
      setSelection("phase1")
      const invalidShutdownEvents = [
        {
          _id: "event1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: Option.some("1"),
          eventType: "agent_shutdown",
          source: "tina-daemon",
          summary: "invalid json",
          detail: Option.some("invalid json {{{"),
          recordedAt: "2026-02-10T10:00:05Z",
        },
      ]

      installAppRuntimeQueryMock(mockUseTypedQuery, {
        states: {
          "events.list": querySuccess(invalidShutdownEvents),
        },
      })

      // Should not throw error
      expect(() => render(<TeamSection detail={buildDetail()} />)).not.toThrow()

      // Verify members shown as active (not crashed, not filtered out)
      expect(screen.getByText("worker1")).toBeInTheDocument()
      expect(screen.getByText("worker2")).toBeInTheDocument()
      expect(screen.queryByText("SHUTDOWN")).not.toBeInTheDocument()
    })

    it("removes multiple shut down agents from the roster", () => {
      setSelection("phase1")
      const shutdownEvents = [
        {
          _id: "event1",
          _creationTime: 1234567890,
          orchestrationId: "orch1",
          phaseNumber: Option.some("1"),
          eventType: "agent_shutdown",
          source: "tina-daemon",
          summary: "worker1 shutdown",
          detail: Option.some(JSON.stringify({
            agent_name: "worker1",
            shutdown_detected_at: "2026-02-10T10:00:00Z",
          })),
          recordedAt: "2026-02-10T10:00:05Z",
        },
        {
          _id: "event2",
          _creationTime: 1234567891,
          orchestrationId: "orch1",
          phaseNumber: Option.some("1"),
          eventType: "agent_shutdown",
          source: "tina-daemon",
          summary: "worker2 shutdown",
          detail: Option.some(JSON.stringify({
            agent_name: "worker2",
            shutdown_detected_at: "2026-02-10T10:01:00Z",
          })),
          recordedAt: "2026-02-10T10:01:05Z",
        },
      ]

      installAppRuntimeQueryMock(mockUseTypedQuery, {
        states: {
          "events.list": querySuccess(shutdownEvents),
        },
      })

      render(
        <TeamSection
          detail={buildDetail({
            teamMembers: [
              buildTeamMember({
                _id: "member1",
                orchestrationId: "orch1",
                phaseNumber: "1",
                agentName: "worker1",
              }),
              buildTeamMember({
                _id: "member2",
                orchestrationId: "orch1",
                phaseNumber: "1",
                agentName: "worker2",
              }),
            ],
          })}
        />,
      )

      // Verify both members are removed
      expect(screen.queryByText("worker1")).not.toBeInTheDocument()
      expect(screen.queryByText("worker2")).not.toBeInTheDocument()
      expect(screen.queryByText("SHUTDOWN")).not.toBeInTheDocument()
      expect(screen.getByText(/no team members/i)).toBeInTheDocument()
    })
  })
})
