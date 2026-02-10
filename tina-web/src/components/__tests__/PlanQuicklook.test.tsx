import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { PlanQuicklook } from "../PlanQuicklook"
import type { Plan } from "@/schemas"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"
import { defineQuicklookDialogContract } from "@/test/harness/quicklook-contract"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

function createMockPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    _id: "plan1",
    _creationTime: 1234567890,
    orchestrationId: "orch1",
    phaseNumber: "1",
    planPath: "docs/plans/2026-02-10-feature-phase-1.md",
    content: "# Plan Title\n\nThis is the plan content.",
    lastSynced: "2026-02-10T10:00:00Z",
    ...overrides,
  }
}

describe("PlanQuicklook", () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("shows loading state while plan loads", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": queryLoading(),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    expect(screen.getByText("Loading plan...")).toBeInTheDocument()
  })

  it("shows error state when plan fails to load", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": queryError("Network error"),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    expect(screen.getByText("Failed to load plan")).toBeInTheDocument()
  })

  it("shows not found message when plan is null", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(null),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    expect(screen.getByText("No plan found")).toBeInTheDocument()
  })

  it("renders markdown with headings", () => {
    const plan = createMockPlan({
      content: "# Title\n## Subtitle\n### Subheading\n\nParagraph text here.",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Verify headings are rendered
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Subtitle" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Subheading" })).toBeInTheDocument()

    // Verify paragraph text
    expect(screen.getByText("Paragraph text here.")).toBeInTheDocument()
  })

  it("renders code blocks with syntax highlighting", () => {
    const plan = createMockPlan({
      content: "```typescript\nconst x = 1;\nconsole.log(x);\n```",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Verify code content is rendered (SyntaxHighlighter renders as pre)
    expect(screen.getByText(/const x = 1;/)).toBeInTheDocument()
    expect(screen.getByText(/console.log\(x\);/)).toBeInTheDocument()
  })

  it("renders inline code with background", () => {
    const plan = createMockPlan({
      content: "Use `const` for constants and `let` for variables.",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Verify inline code elements are rendered
    const codeElements = screen.getAllByText(/(const|let)/)
    expect(codeElements.length).toBeGreaterThan(0)
  })

  it("renders GFM tables", () => {
    const plan = createMockPlan({
      content: "| Column 1 | Column 2 |\n|----------|----------|\n| Cell A   | Cell B   |\n| Cell C   | Cell D   |",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Verify table is rendered
    const table = screen.getByRole("table")
    expect(table).toBeInTheDocument()

    // Verify table headers
    expect(within(table).getByText("Column 1")).toBeInTheDocument()
    expect(within(table).getByText("Column 2")).toBeInTheDocument()

    // Verify table cells
    expect(within(table).getByText("Cell A")).toBeInTheDocument()
    expect(within(table).getByText("Cell B")).toBeInTheDocument()
    expect(within(table).getByText("Cell C")).toBeInTheDocument()
    expect(within(table).getByText("Cell D")).toBeInTheDocument()
  })

  it("renders GFM task lists", () => {
    const plan = createMockPlan({
      content: "## Tasks\n\n- [x] Completed task\n- [ ] Pending task\n- [ ] Another pending task",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Verify checkboxes are rendered
    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes.length).toBe(3)

    // Verify first checkbox is checked
    expect(checkboxes[0]).toBeChecked()

    // Verify other checkboxes are unchecked
    expect(checkboxes[1]).not.toBeChecked()
    expect(checkboxes[2]).not.toBeChecked()

    // Verify task text
    expect(screen.getByText("Completed task")).toBeInTheDocument()
    expect(screen.getByText("Pending task")).toBeInTheDocument()
    expect(screen.getByText("Another pending task")).toBeInTheDocument()
  })

  it("renders strikethrough text (GFM)", () => {
    const plan = createMockPlan({
      content: "This is ~~strikethrough~~ text.",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Verify strikethrough element exists
    const strikethrough = screen.getByText("strikethrough")
    expect(strikethrough.tagName.toLowerCase()).toBe("del")
  })

  it("renders bold and italic formatting", () => {
    const plan = createMockPlan({
      content: "This is **bold** and *italic* text.",
    })

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Verify bold element
    const bold = screen.getByText("bold")
    expect(bold.tagName.toLowerCase()).toBe("strong")

    // Verify italic element
    const italic = screen.getByText("italic")
    expect(italic.tagName.toLowerCase()).toBe("em")
  })

  it("calls onClose when close button clicked", async () => {
    const user = userEvent.setup()
    const plan = createMockPlan()

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Click the close button
    const closeButton = screen.getByLabelText("Close quicklook")
    await user.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("calls onClose when backdrop clicked", async () => {
    const user = userEvent.setup()
    const plan = createMockPlan()

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
    )

    // Click the backdrop
    const dialog = screen.getByRole("dialog")
    const backdrop = dialog.parentElement!
    await user.click(backdrop)

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it("displays phase number in title", () => {
    const plan = createMockPlan()

    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "plans.get": querySuccess(plan),
      },
    })

    render(
      <PlanQuicklook orchestrationId="orch1" phaseNumber="3" onClose={mockOnClose} />
    )

    expect(screen.getByText("Phase 3 Plan")).toBeInTheDocument()
  })

  defineQuicklookDialogContract({
    renderDialog: () => {
      installAppRuntimeQueryMock(mockUseTypedQuery, {
        states: {
          "plans.get": querySuccess(createMockPlan()),
        },
      })
      render(
        <PlanQuicklook orchestrationId="orch1" phaseNumber="1" onClose={mockOnClose} />
      )
    },
    onClose: mockOnClose,
  })
})
