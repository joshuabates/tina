import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { Option } from "effect"
import { PhaseQuicklook } from "../PhaseQuicklook"
import type { Phase, TaskEvent, TeamMember } from "@/schemas"

// Mock useActionRegistration
vi.mock("@/hooks/useActionRegistration")

describe("PhaseQuicklook", () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  const createMockPhase = (overrides?: Partial<Phase>): Phase => ({
    _id: "phase1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: "1",
    status: "executing",
    planPath: Option.some("/docs/plans/2024-01-01-test-phase-1.md"),
    gitRange: Option.some("abc123..def456"),
    planningMins: Option.some(10),
    executionMins: Option.some(25),
    reviewMins: Option.some(5),
    startedAt: Option.some("2024-01-01T10:00:00Z"),
    completedAt: Option.none(),
    ...overrides,
  })

  const createMockTasks = (): TaskEvent[] => [
    {
      _id: "task1",
      _creationTime: 1234567890,
      orchestrationId: "orch1",
      phaseNumber: Option.some("1"),
      taskId: "1",
      subject: "Task 1",
      description: Option.some("Description 1"),
      status: "completed",
      owner: Option.some("worker1"),
      blockedBy: Option.none(),
      metadata: Option.none(),
      recordedAt: "2024-01-01T10:00:00Z",
    },
    {
      _id: "task2",
      _creationTime: 1234567891,
      orchestrationId: "orch1",
      phaseNumber: Option.some("1"),
      taskId: "2",
      subject: "Task 2",
      description: Option.some("Description 2"),
      status: "in_progress",
      owner: Option.some("worker2"),
      blockedBy: Option.none(),
      metadata: Option.none(),
      recordedAt: "2024-01-01T10:05:00Z",
    },
    {
      _id: "task3",
      _creationTime: 1234567892,
      orchestrationId: "orch1",
      phaseNumber: Option.some("1"),
      taskId: "3",
      subject: "Task 3",
      description: Option.some("Description 3"),
      status: "pending",
      owner: Option.none(),
      blockedBy: Option.none(),
      metadata: Option.none(),
      recordedAt: "2024-01-01T10:10:00Z",
    },
  ]

  const createMockTeamMembers = (): TeamMember[] => [
    {
      _id: "member1",
      _creationTime: 1234567890,
      orchestrationId: "orch1",
      phaseNumber: "1",
      agentName: "worker1",
      agentType: Option.some("implementer"),
      model: Option.some("sonnet"),
      joinedAt: Option.some("2024-01-01T10:00:00Z"),
      recordedAt: "2024-01-01T10:00:00Z",
    },
    {
      _id: "member2",
      _creationTime: 1234567891,
      orchestrationId: "orch1",
      phaseNumber: "1",
      agentName: "worker2",
      agentType: Option.some("reviewer"),
      model: Option.some("sonnet"),
      joinedAt: Option.some("2024-01-01T10:05:00Z"),
      recordedAt: "2024-01-01T10:05:00Z",
    },
  ]

  it("shows phase number and status badge", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText(/Phase 1/)).toBeInTheDocument()
    expect(screen.getByText("executing")).toBeInTheDocument()
  })

  it("shows timing information when available", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText("Planning:")).toBeInTheDocument()
    expect(screen.getByText("10 min")).toBeInTheDocument()
    expect(screen.getByText("Execution:")).toBeInTheDocument()
    expect(screen.getByText("25 min")).toBeInTheDocument()
    expect(screen.getByText("Review:")).toBeInTheDocument()
    expect(screen.getByText("5 min")).toBeInTheDocument()
  })

  it("shows placeholder for missing timing information", () => {
    const phase = createMockPhase({
      planningMins: Option.none(),
      executionMins: Option.none(),
      reviewMins: Option.none(),
    })
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    // Should show "—" for all missing timing values
    const timingHeading = screen.getByRole("heading", { name: "Timing" })
    const timingSection = timingHeading.closest("section")!
    const placeholders = within(timingSection).getAllByText("—")
    expect(placeholders).toHaveLength(3) // Planning, Execution, Review
  })

  it("shows plan path when available", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText(/2024-01-01-test-phase-1\.md/)).toBeInTheDocument()
  })

  it("shows placeholder when plan path is missing", () => {
    const phase = createMockPhase({ planPath: Option.none() })
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    // Find the "Plan" heading and check its sibling value element
    const planHeading = screen.getByRole("heading", { name: "Plan" })
    const planSection = planHeading.closest("section")!
    const valueElement = within(planSection).getByText("—")
    expect(valueElement).toBeInTheDocument()
  })

  it("shows git range when available", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText(/abc123\.\.def456/)).toBeInTheDocument()
  })

  it("shows placeholder when git range is missing", () => {
    const phase = createMockPhase({ gitRange: Option.none() })
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    // Find the "Git Range" heading and check its sibling value element
    const gitHeading = screen.getByRole("heading", { name: "Git Range" })
    const gitSection = gitHeading.closest("section")!
    const valueElement = within(gitSection).getByText("—")
    expect(valueElement).toBeInTheDocument()
  })

  it("shows task summary with completed count", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks() // 1 completed, 1 in_progress, 1 pending = 1/3 complete
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText(/1\/3 tasks complete/i)).toBeInTheDocument()
  })

  it("shows team member list", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText("worker1")).toBeInTheDocument()
    expect(screen.getByText("worker2")).toBeInTheDocument()
  })

  it("shows agent types for team members when available", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText(/implementer/i)).toBeInTheDocument()
    expect(screen.getByText(/reviewer/i)).toBeInTheDocument()
  })

  it("closes modal when Escape is pressed", async () => {
    const user = userEvent.setup()
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    await user.keyboard("{Escape}")

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("closes modal when Space is pressed", async () => {
    const user = userEvent.setup()
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    await user.keyboard(" ")

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("traps focus inside modal", async () => {
    const user = userEvent.setup()
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    // Modal should be focused on mount
    const modal = screen.getByRole("dialog")
    expect(modal).toHaveFocus()

    // Tab through focusable elements - focus should stay within modal
    await user.tab()
    const closeButton = screen.getByRole("button", { name: /close/i })
    expect(closeButton).toHaveFocus()

    // Tab again - should cycle back to modal
    await user.tab()
    expect(modal).toHaveFocus()
  })

  it("renders as a dialog with appropriate ARIA attributes", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAttribute("aria-labelledby")
  })

  it("handles empty team members list", () => {
    const phase = createMockPhase()
    const tasks = createMockTasks()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={tasks}
        teamMembers={[]}
        onClose={mockOnClose}
      />
    )

    const teamHeading = screen.getByRole("heading", { name: "Team" })
    const teamSection = teamHeading.closest("section")!
    const valueElement = within(teamSection).getByText(/no team members/i)
    expect(valueElement).toBeInTheDocument()
  })

  it("handles empty tasks list", () => {
    const phase = createMockPhase()
    const teamMembers = createMockTeamMembers()

    render(
      <PhaseQuicklook
        phase={phase}
        tasks={[]}
        teamMembers={teamMembers}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText(/0\/0 tasks complete/i)).toBeInTheDocument()
  })
})
