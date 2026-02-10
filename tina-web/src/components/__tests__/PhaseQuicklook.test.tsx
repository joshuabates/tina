import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { PhaseQuicklook } from "../PhaseQuicklook"
import {
  buildPhase,
  buildTaskEvent,
  buildTeamMember,
  none,
  some,
} from "@/test/builders/domain"
import type { Phase, TaskEvent, TeamMember } from "@/schemas"
import { assertDialogFocusTrap } from "@/test/harness/quicklook"

vi.mock("@/hooks/useActionRegistration")

const mockOnClose = vi.fn()

interface QuicklookFixtureOverrides {
  phase?: Partial<Phase>
  tasks?: TaskEvent[]
  teamMembers?: TeamMember[]
}

const defaultTasks = [
  buildTaskEvent({ _id: "task1", taskId: "1", subject: "Task 1", status: "completed", owner: some("worker1") }),
  buildTaskEvent({ _id: "task2", taskId: "2", subject: "Task 2", status: "in_progress", owner: some("worker2") }),
  buildTaskEvent({ _id: "task3", taskId: "3", subject: "Task 3" }),
]

const defaultTeamMembers = [
  buildTeamMember({ _id: "member1", agentName: "worker1", agentType: some("implementer") }),
  buildTeamMember({ _id: "member2", agentName: "worker2", agentType: some("reviewer") }),
]

const optionalPhaseFields = [
  {
    label: "plan path",
    heading: "Plan",
    value: /2024-01-01-test-phase-1\.md/,
    missing: { planPath: none<string>() } as Partial<Phase>,
  },
  {
    label: "git range",
    heading: "Git Range",
    value: /abc123\.\.def456/,
    missing: { gitRange: none<string>() } as Partial<Phase>,
  },
]

function buildQuicklookFixture(overrides: QuicklookFixtureOverrides = {}) {
  return {
    phase: buildPhase({
      phaseNumber: "1",
      status: "executing",
      planPath: some("/docs/plans/2024-01-01-test-phase-1.md"),
      gitRange: some("abc123..def456"),
      planningMins: some(10),
      executionMins: some(25),
      reviewMins: some(5),
      startedAt: some("2024-01-01T10:00:00Z"),
      ...overrides.phase,
    }),
    tasks: overrides.tasks ?? defaultTasks,
    teamMembers: overrides.teamMembers ?? defaultTeamMembers,
  }
}

function renderQuicklook(overrides: QuicklookFixtureOverrides = {}) {
  const { phase, tasks, teamMembers } = buildQuicklookFixture(overrides)
  render(
    <PhaseQuicklook
      phase={phase}
      tasks={tasks}
      teamMembers={teamMembers}
      onClose={mockOnClose}
    />,
  )
}

function sectionByHeading(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { name })
  const section = heading.closest("section")
  expect(section).toBeTruthy()
  return section as HTMLElement
}

describe("PhaseQuicklook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows phase number and status badge", () => {
    renderQuicklook()

    expect(screen.getByText(/Phase 1/)).toBeInTheDocument()
    expect(screen.getByText("executing")).toBeInTheDocument()
  })

  it.each([
    ["Planning:", "10 min"],
    ["Execution:", "25 min"],
    ["Review:", "5 min"],
  ])("shows timing row %s %s", (label, value) => {
    renderQuicklook()

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText(value)).toBeInTheDocument()
  })

  it("shows placeholders when timing information is missing", () => {
    renderQuicklook({
      phase: {
        planningMins: none<number>(),
        executionMins: none<number>(),
        reviewMins: none<number>(),
      },
    })

    expect(within(sectionByHeading("Timing")).getAllByText("—")).toHaveLength(3)
  })

  it.each(optionalPhaseFields)("shows $label value when available", ({ value }) => {
    renderQuicklook()

    expect(screen.getByText(value)).toBeInTheDocument()
  })

  it.each(optionalPhaseFields)("shows placeholder when $label is missing", ({ heading, missing }) => {
    renderQuicklook({ phase: missing })

    expect(within(sectionByHeading(heading)).getByText("—")).toBeInTheDocument()
  })

  it("shows task summary with completed count", () => {
    renderQuicklook()

    expect(screen.getByText(/1\/3 tasks complete/i)).toBeInTheDocument()
  })

  it.each([
    { name: "worker1", type: /implementer/i },
    { name: "worker2", type: /reviewer/i },
  ])("shows team member metadata for $name", ({ name, type }) => {
    renderQuicklook()

    expect(screen.getByText(name)).toBeInTheDocument()
    expect(screen.getByText(type)).toBeInTheDocument()
  })

  it.each(["{Escape}", " "])("closes modal on key %s", async (key) => {
    const user = userEvent.setup()
    renderQuicklook()

    await user.keyboard(key)

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("traps focus inside modal", async () => {
    const user = userEvent.setup()
    renderQuicklook()

    const modal = screen.getByRole("dialog")
    const closeButton = screen.getByRole("button", { name: /close/i })
    await assertDialogFocusTrap(user, modal, closeButton)
  })

  it("renders as a dialog with appropriate ARIA attributes", () => {
    renderQuicklook()

    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAttribute("aria-labelledby")
  })

  it("handles empty team members list", () => {
    renderQuicklook({ teamMembers: [] })

    expect(within(sectionByHeading("Team")).getByText(/no team members/i)).toBeInTheDocument()
  })

  it("handles empty tasks list", () => {
    renderQuicklook({ tasks: [] })

    expect(screen.getByText(/0\/0 tasks complete/i)).toBeInTheDocument()
  })
})
