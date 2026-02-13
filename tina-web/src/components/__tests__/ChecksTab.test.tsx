import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ChecksTab } from "../ChecksTab"
import { installAppRuntimeQueryMock } from "@/test/harness/app-runtime"
import { querySuccess, queryLoading, queryError } from "@/test/builders/query"
import { buildReviewCheck } from "@/test/builders/domain/entities"
import { some, none } from "@/test/builders/domain/primitives"

vi.mock("@/hooks/useTypedQuery")

const mockUseTypedQuery = vi.mocked(
  await import("@/hooks/useTypedQuery"),
).useTypedQuery

function renderTab(reviewId = "rev1") {
  return render(
    <MemoryRouter>
      <ChecksTab reviewId={reviewId} />
    </MemoryRouter>,
  )
}

describe("ChecksTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows loading state", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": queryLoading(),
      },
    })

    renderTab()

    expect(screen.getByText("Loading checks...")).toBeInTheDocument()
  })

  it("shows error state", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": queryError(new Error("Network error")),
      },
    })

    renderTab()

    expect(screen.getByText("Failed to load checks")).toBeInTheDocument()
  })

  it("shows empty state when no checks exist", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([]),
      },
    })

    renderTab()

    expect(screen.getByText("No checks yet")).toBeInTheDocument()
  })

  it("renders check rows with name, kind, and status badge", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([
          buildReviewCheck({
            _id: "c1",
            name: "typecheck",
            kind: "cli",
            status: "passed",
            durationMs: some(4200),
          }),
          buildReviewCheck({
            _id: "c2",
            name: "test",
            kind: "cli",
            status: "failed",
            durationMs: some(12800),
            comment: some("3 tests failed"),
            output: some("FAIL src/foo.test.ts\n  x should work"),
          }),
          buildReviewCheck({
            _id: "c3",
            name: "api-contracts",
            kind: "project",
            status: "running",
            command: none<string>(),
            completedAt: none<string>(),
            durationMs: none<number>(),
          }),
        ]),
      },
    })

    renderTab()

    expect(screen.getByText("typecheck")).toBeInTheDocument()
    expect(screen.getByText("test")).toBeInTheDocument()
    expect(screen.getByText("api-contracts")).toBeInTheDocument()

    // Status badges
    expect(screen.getByText("Passed")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("Running")).toBeInTheDocument()
  })

  it("shows duration for completed checks", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([
          buildReviewCheck({
            _id: "c1",
            name: "typecheck",
            status: "passed",
            durationMs: some(4200),
          }),
        ]),
      },
    })

    renderTab()

    expect(screen.getByText("4.2s")).toBeInTheDocument()
  })

  it("shows failure output for failed checks", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([
          buildReviewCheck({
            _id: "c1",
            name: "test",
            status: "failed",
            comment: some("3 tests failed"),
            output: some("FAIL src/foo.test.ts"),
          }),
        ]),
      },
    })

    renderTab()

    expect(screen.getByText("3 tests failed")).toBeInTheDocument()
    expect(screen.getByText("FAIL src/foo.test.ts")).toBeInTheDocument()
  })

  it("shows kind badge distinguishing cli and project checks", () => {
    installAppRuntimeQueryMock(mockUseTypedQuery, {
      states: {
        "reviewChecks.list": querySuccess([
          buildReviewCheck({ _id: "c1", name: "typecheck", kind: "cli" }),
          buildReviewCheck({ _id: "c2", name: "api-contracts", kind: "project" }),
        ]),
      },
    })

    renderTab()

    const rows = screen.getAllByTestId("check-row")
    expect(within(rows[0]).getByText("cli")).toBeInTheDocument()
    expect(within(rows[1]).getByText("project")).toBeInTheDocument()
  })
})
