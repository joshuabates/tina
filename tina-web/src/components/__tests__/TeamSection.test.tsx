import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { TeamSection } from "../TeamSection"
import type { OrchestrationDetail } from "@/schemas"
import {
  buildOrchestrationDetail,
  buildPhase,
  buildTeamMember,
} from "@/test/builders/domain"
import { setPanelFocus, setPanelSelection } from "@/test/harness/panel-state"

vi.mock("@/hooks/useFocusable")
vi.mock("@/hooks/useSelection")
vi.mock("@/hooks/useActionRegistration")

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
  })

  it("renders team members with correct names", () => {
    render(<TeamSection detail={buildDetail()} />)

    expect(screen.getByText("worker1")).toBeInTheDocument()
    expect(screen.getByText("worker2")).toBeInTheDocument()
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

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.team", 2)

    rerender(
      <TeamSection
        detail={buildDetail({
          teamMembers: [
            ...detail.teamMembers,
            buildTeamMember({
              _id: "member3",
              _creationTime: 1234567892,
              orchestrationId: "orch1",
              phaseNumber: "1",
              agentName: "worker3",
            }),
          ],
        })}
      />,
    )

    expect(mockUseFocusable).toHaveBeenCalledWith("rightPanel.team", 3)
  })
})
