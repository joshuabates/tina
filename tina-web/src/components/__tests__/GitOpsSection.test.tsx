import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { GitOpsSection } from "../GitOpsSection"
import { buildOrchestrationEvent, none, some } from "@/test/builders/domain"
import type { OrchestrationEvent } from "@/schemas"

function event(overrides: Partial<OrchestrationEvent> = {}): OrchestrationEvent {
  return buildOrchestrationEvent({
    _id: "event1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: some("1"),
    source: "tina-session",
    eventType: "git_commit",
    summary: "Add user authentication",
    detail: some("abc1234"),
    recordedAt: "2024-01-01T10:00:00Z",
    ...overrides,
  })
}

function renderSection(gitEvents: OrchestrationEvent[] = [], isLoading = false) {
  return render(<GitOpsSection gitEvents={gitEvents} isLoading={isLoading} />)
}

describe("GitOpsSection", () => {
  it("renders recent git events", () => {
    renderSection([
      event({ _id: "event1", summary: "Add user authentication", detail: some("abc1234") }),
      event({ _id: "event2", _creationTime: 1234567891, summary: "Fix login bug", detail: some("def5678") }),
    ])

    expect(screen.getByText("Add user authentication")).toBeInTheDocument()
    expect(screen.getByText("Fix login bug")).toBeInTheDocument()
    expect(screen.getByText("abc1234")).toBeInTheDocument()
    expect(screen.getByText("def5678")).toBeInTheDocument()
  })

  it("renders diff summary from git_diff events", () => {
    renderSection([
      event({ eventType: "git_diff", summary: "Changes in 3 files", detail: some("+42 -15") }),
    ])

    expect(screen.getByText("Changes in 3 files")).toBeInTheDocument()
    expect(screen.getByText("+42 -15")).toBeInTheDocument()
  })

  it("shows empty state when there are no events", () => {
    renderSection([])

    expect(screen.getByText(/no git activity/i)).toBeInTheDocument()
  })

  it("renders detail in monospace font", () => {
    renderSection([event({ eventType: "git_commit", summary: "Add feature", detail: some("abc1234") })])

    expect(screen.getByText("abc1234").className).toMatch(/font-mono/)
  })

  it("handles git events with missing detail", () => {
    renderSection([event({ eventType: "git_commit", summary: "Add feature", detail: none<string>() })])

    expect(screen.getByText("Add feature")).toBeInTheDocument()
    expect(screen.queryByText("abc1234")).not.toBeInTheDocument()
  })

  it("uses stat panel layout with 'Git Operations' label", () => {
    renderSection([])

    expect(screen.getByText("Git Operations")).toBeInTheDocument()
  })

  it("renders loading state while events are fetching", () => {
    renderSection([], true)

    expect(screen.getByText(/loading git activity/i)).toBeInTheDocument()
  })
})
